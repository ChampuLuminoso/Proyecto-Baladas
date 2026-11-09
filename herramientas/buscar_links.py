"""
Buscador de links desde el computador · DJ Jorge Montes
========================================================
Busca en YouTube «artista + canción» para cada canción sin link de
datos/canciones.json, sin clave y sin límite diario.

- NO descarga videos ni audio: solo lee el resultado de la búsqueda
  (título, canal, duración) y pregunta a YouTube si el video se deja
  poner en otras páginas (oEmbed).
- Guarda el avance en herramientas/links_encontrados.json: si se corta,
  al volver a abrirlo sigue donde iba.
- Al final pone los links en datos/canciones.json como «por verificar»
  (antes deja una copia: datos/canciones.respaldo.json).

Uso:   python herramientas/buscar_links.py            (todas)
       python herramientas/buscar_links.py --cuantas 20   (solo 20, para probar)
       python herramientas/buscar_links.py --no-aplicar   (no toca canciones.json)
Necesita:  pip install -U yt-dlp
"""
import argparse
import json
import random
import re
import shutil
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CANCIONES = RAIZ / 'datos' / 'canciones.json'
RESPALDO = RAIZ / 'datos' / 'canciones.respaldo.json'
RESULTADOS = RAIZ / 'herramientas' / 'links_encontrados.json'
CANDADO = RAIZ / 'herramientas' / 'buscando.candado'


# ─────────── Conexión con YouTube (dos funciones pequeñas) ───────────
class YouTubeNosFreno(Exception):
    """YouTube pidió confirmar que no somos un robot: hay que esperar."""


def buscar(consulta, cuantos=5):
    """Devuelve [{id, titulo, canal, dur}] con los primeros resultados. No descarga nada."""
    from yt_dlp import YoutubeDL
    from yt_dlp.utils import DownloadError
    opciones = {'quiet': True, 'no_warnings': True, 'extract_flat': 'in_playlist', 'skip_download': True}
    try:
        with YoutubeDL(opciones) as ydl:
            info = ydl.extract_info(f'ytsearch{cuantos}:{consulta}', download=False)
    except DownloadError as e:
        texto = str(e).lower()
        if 'not a bot' in texto or '429' in texto or 'too many' in texto:
            raise YouTubeNosFreno(str(e)) from e
        raise
    salida = []
    for v in (info or {}).get('entries') or []:
        if not v or not v.get('id'):
            continue
        salida.append({
            'id': v['id'],
            'titulo': v.get('title') or '',
            'canal': v.get('channel') or v.get('uploader') or '',
            'dur': int(v['duration']) if v.get('duration') else 0,
        })
    return salida


def se_puede_incrustar(video_id):
    """oEmbed (servicio público de YouTube): 200 = sí; 401/403 = el dueño no deja; 404 = borrado o privado."""
    url = 'https://www.youtube.com/oembed?format=json&url=' + urllib.parse.quote(f'https://www.youtube.com/watch?v={video_id}')
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'DJBaladas/1.0'}), timeout=15) as r:
            return r.status == 200, None
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return False, 'el dueño no deja ponerlo en otras páginas'
        if e.code == 404:
            return False, 'borrado o privado'
        if e.code == 429:
            raise YouTubeNosFreno('429') from e
        return None, f'error {e.code}'
    except Exception:
        return None, 'sin respuesta'


# ─────────── Elegir el mejor video (mismo criterio que la página) ───────────
def normalizar(t=''):
    t = unicodedata.normalize('NFD', str(t)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', t).strip()


def solo_letras(t):
    return re.sub(r'[^a-z0-9 ]', '', normalizar(t))


# Cantantes italianos, brasileños, franceses, griegos… que grabaron sus éxitos en español.
# Con --espanol se les busca la versión en español.
OTRO_IDIOMA = {
    'Roberto Carlos', 'Nelson Ned', 'Fabio Junior', 'Alexandre Pires', 'Odair José', 'Nilton César',
    'José Augusto', 'Sergio Méndez', 'Umberto Tozzi', 'Franco Simone', 'Laura Pausini', 'Eros Ramazzotti',
    'Gianluca Grignani', 'Gianni Bella', 'Gigliola Cinquetti', 'Lucio Battisti', 'Marcella Bella',
    'Nicola di Bari', 'Paolo Salvatore', 'Pooh', 'Riccardo Cocciante', 'Ricos y Pobres', 'Domenico Modugno',
    'Raffaella Carrà', 'Adamo', 'Joe Dassin', 'Frédéric François', 'Francis Cabrel', 'Demis Roussos',
    'Vicky Leandros', 'Lorenzo Toppano', 'Andrea Bocelli y Martha Sánchez', 'Il Divo',
}
MARCA_ESPANOL = r'espanol|castellano|spanish|version en espanol|en espanol'
MARCA_OTRO = (r'italian|italia|\bversione\b|portugues|\bao vivo\b|\bversao\b|\bfrancais\b|'
              r'warner music italy|sony music italy|\bem portugues\b')

MALAS = [
    (r'\bft\b|\bfeat\b|\bwith\b', 'con otro cantante'),
    (r'karaoke', 'karaoke'), (r'\bcover\b|version de', 'cover'), (r'instrumental', 'instrumental'),
    (r'tutorial|acordes|chords|como tocar|piano|guitarra', 'tutorial'),
    (r'reacci|react', 'reacción'), (r'remix', 'remix'),
    (r'mix\b|exitos|grandes|enganchad|full album|album completo|lo mejor de', 'recopilación'),
]


def puntuar(c, v, espanol=False):
    titulo, canal = normalizar(v['titulo']), normalizar(v['canal'])
    cancion, artista = solo_letras(c['titulo']), solo_letras(c['artista'])
    apellido = ([p for p in artista.split() if len(p) > 3] or [artista])[-1]
    p, malas, buenas = 0, [], []
    if cancion and cancion in solo_letras(v['titulo']):
        p += 4
    if artista in titulo or artista in canal:
        p += 3
    elif apellido in titulo or apellido in canal:
        p += 2
    if canal.endswith(' - topic'):
        p += 2
    if re.search(r'vevo|oficial|official', canal + ' ' + titulo):
        p += 1
    if re.search(r'en vivo|\blive\b', titulo):
        p -= 1
        malas.append('en vivo')
    # «Carlos Rivera, Roberto Carlos - …» o «Matteo Bocelli & Gianluca Grignani - …»: dúo nuevo, no el original
    pos = titulo.find(artista) if artista and artista in titulo else (titulo.find(apellido) if apellido else -1)
    if pos > 0 and re.search(r'[,&]|\sx\s|\sy\s|\sft\b|\sfeat\b', titulo[:pos]) and not re.search(r'\sy\s|&', normalizar(c['artista'])):
        p -= 5
        malas.append('dúo o versión nueva')
    nombre_cancion = normalizar(c['titulo'])
    for patron, nombre in MALAS:
        if re.search(patron, titulo) and not re.search(patron, nombre_cancion):
            p -= 5
            malas.append(nombre)
    if espanol:
        texto = titulo + ' ' + canal
        if re.search(MARCA_ESPANOL, texto):
            p += 4
            buenas.append('dice «español»')
        if re.search(MARCA_OTRO, texto):
            p -= 4
            malas.append('parece de otro idioma')
    if v['dur'] and (v['dur'] < 90 or v['dur'] > 12 * 60):
        p -= 4
        malas.append('muy corto' if v['dur'] < 90 else 'muy largo')
    return {**v, 'puntos': p, 'malas': malas, 'buenas': buenas}


def procesar(c, previas=None, consultas=None, espanol=False):
    vistos, crudas = set(), []
    for q in consultas or [f"{c['artista']} {c['titulo']}"]:
        for v in buscar(q):
            if v['id'] not in vistos:
                vistos.add(v['id'])
                crudas.append(v)
        time.sleep(0.5)
    for v in previas or []:  # lo que ya se había encontrado antes también cuenta
        if v['id'] not in vistos and v.get('incrustable') is not False:
            vistos.add(v['id'])
            crudas.append({k: v[k] for k in ('id', 'titulo', 'canal', 'dur')})
    candidatas = sorted((puntuar(c, v, espanol) for v in crudas), key=lambda v: -v['puntos'])
    # Revisamos en orden hasta encontrar una que se deje incrustar.
    for v in candidatas:
        ok, motivo = se_puede_incrustar(v['id'])
        v['incrustable'] = ok
        if ok is False:
            v['puntos'] -= 50
            v['malas'].append('no se puede usar' + (f' ({motivo})' if motivo else ''))
        if ok:
            break
        time.sleep(0.3)
    candidatas = sorted((v for v in candidatas if v['puntos'] > -40), key=lambda v: -v['puntos'])
    if not candidatas:
        estado = 'ninguna'
    elif candidatas[0]['puntos'] >= 7 and candidatas[0].get('incrustable') and (
            not espanol or candidatas[0]['buenas']):
        estado = 'probable'
    else:
        estado = 'dudosa'   # con --espanol: si no dice «español», Jorge lo escucha para confirmar
    return {'cand': candidatas, 'i': 0, 'estado': estado, 'fecha': datetime.now().isoformat(timespec='seconds')}


# ─────────── Programa ───────────
def leer_json(ruta, defecto):
    try:
        return json.loads(ruta.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return defecto


def guardar_json(ruta, datos, sangria=1):
    tmp = ruta.with_suffix('.tmp')
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=sangria), encoding='utf-8')
    tmp.replace(ruta)  # se escribe completo o no se escribe (no queda a medias si se corta)


def guardar_una(id_cancion, r):
    """Guarda SOLO esta canción: vuelve a leer el archivo y le suma el resultado.
    Así, si hay dos ventanas buscando a la vez, ninguna borra lo de la otra."""
    todos = leer_json(RESULTADOS, {})
    todos[id_cancion] = r
    guardar_json(RESULTADOS, todos)
    return todos


def aplicar(datos, resultados):
    if not RESPALDO.exists():
        shutil.copyfile(CANCIONES, RESPALDO)
    puestas = 0
    for c in datos['canciones']:
        r = resultados.get(c['id'])
        if not r or (c.get('youtubeId') and c.get('estado') == 'ok'):
            continue
        if r['estado'] == 'ninguna' or not r['cand']:
            if c.get('estado') != 'ok':
                c['youtubeId'], c['estado'] = '', 'sin link'
            continue
        c['youtubeId'] = r['cand'][r['i']]['id']
        c['estado'] = 'por verificar'
        puestas += 1
    datos['actualizado'] = datetime.now().strftime('%Y-%m-%d')
    guardar_json(CANCIONES, datos)
    return puestas


def tomar_candado():
    """Evita que dos ventanas trabajen a la vez (se pisarían el archivo de resultados)."""
    import os
    if CANDADO.exists() and time.time() - CANDADO.stat().st_mtime < 3 * 3600:
        print('\n⛔ Ya hay otra ventana del buscador trabajando.')
        print('   Espere a que termine y vuelva a abrir esta. (Si no hay ninguna abierta,')
        print(f'   borre el archivo {CANDADO.name} de la carpeta herramientas.)\n')
        sys.exit(1)
    CANDADO.write_text(str(os.getpid()))


def main():
    tomar_candado()
    try:
        _main()
    finally:
        CANDADO.unlink(missing_ok=True)


def _main():
    ap = argparse.ArgumentParser(description='Busca links de YouTube para las canciones sin link.')
    ap.add_argument('--cuantas', type=int, default=0, help='cuántas buscar ahora (0 = todas)')
    ap.add_argument('--no-aplicar', action='store_true', help='no escribir en datos/canciones.json')
    ap.add_argument('--espanol', action='store_true',
                    help='buscar la versión EN ESPAÑOL de los cantantes italianos, brasileños, franceses…')
    ap.add_argument('--reintentar', action='store_true',
                    help='volver a buscar las dudosas y sin resultado con otras palabras («letra», «audio»)')
    args = ap.parse_args()

    try:
        import yt_dlp  # noqa: F401
    except ImportError:
        print('Falta instalar yt-dlp. Escriba:  pip install -U yt-dlp')
        sys.exit(1)

    datos = leer_json(CANCIONES, None)
    if not datos:
        print(f'No encontré {CANCIONES}')
        sys.exit(1)
    resultados = leer_json(RESULTADOS, {})
    if args.espanol:
        pendientes = [c for c in datos['canciones'] if c['artista'] in OTRO_IDIOMA
                      and not resultados.get(c['id'], {}).get('espanol')
                      and resultados.get(c['id'], {}).get('estado') != 'ok']
    elif args.reintentar:
        pendientes = [c for c in datos['canciones'] if c['id'] in resultados
                      and resultados[c['id']]['estado'] in ('ninguna', 'dudosa')
                      and not resultados[c['id']].get('reintentada')]
    else:
        pendientes = [c for c in datos['canciones'] if not c.get('youtubeId') and c['id'] not in resultados]
    if args.cuantas:
        pendientes = pendientes[:args.cuantas]

    total = len(pendientes)
    print(f'\n🎵 DJ Jorge Montes · {len(datos["canciones"])} canciones · {total} por buscar\n')
    inicio = time.time()
    hechas = 0
    try:
        for n, c in enumerate(pendientes, 1):
            if args.espanol:
                previa = resultados.get(c['id'], {'cand': []})
                r = procesar(c, previas=previa['cand'], espanol=True, consultas=[
                    f"{c['artista']} {c['titulo']} en español",
                    f"{c['titulo']} {c['artista']} versión en español"])
                r['espanol'] = True
            elif args.reintentar:
                previa = resultados[c['id']]
                r = procesar(c, previas=previa['cand'], consultas=[
                    f"{c['artista']} {c['titulo']} letra", f"{c['titulo']} {c['artista']} audio"])
                r['reintentada'] = True
            else:
                r = procesar(c)
            resultados = guardar_una(c['id'], r)
            hechas += 1
            icono = {'probable': '🟡', 'dudosa': '🟠', 'ninguna': '⚪'}[r['estado']]
            elegido = r['cand'][0]['titulo'][:55] if r['cand'] else '(sin resultado)'
            resta = (time.time() - inicio) / n * (total - n)
            print(f'{icono} {n:>3}/{total}  {c["artista"]} — {c["titulo"]}\n          → {elegido}   (faltan ~{int(resta // 60)} min)')
            time.sleep(1.0 + random.random())  # despacio, como una persona
    except YouTubeNosFreno:
        print('\n⏸  YouTube pidió una pausa («confirma que no eres un robot»).')
        print('    Lo avanzado quedó guardado. Vuelva a intentarlo en una o dos horas.')
    except KeyboardInterrupt:
        print('\n⏸  Pausado. Lo avanzado quedó guardado; al volver a abrirlo sigue donde iba.')

    cuenta = {'probable': 0, 'dudosa': 0, 'ninguna': 0}
    for r in resultados.values():
        cuenta[r['estado']] = cuenta.get(r['estado'], 0) + 1
    print(f'\nEsta vez: {hechas} canciones.  En total: 🟡 {cuenta["probable"]} probables · '
          f'🟠 {cuenta["dudosa"]} dudosas · ⚪ {cuenta["ninguna"]} sin resultado')

    if not args.no_aplicar and resultados:
        datos = leer_json(CANCIONES, datos)          # lo más reciente, por si otra ventana lo cambió
        puestas = aplicar(datos, leer_json(RESULTADOS, resultados))
        print(f'✅ {puestas} canciones con link en datos/canciones.json (copia de seguridad: canciones.respaldo.json)')
    print('\nSiguiente paso: abra editor/links.html → «📂 Abrir resultados del computador» para revisar las dudosas.\n')


if __name__ == '__main__':
    main()

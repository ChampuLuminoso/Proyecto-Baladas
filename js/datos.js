// Carga canciones.json y lo deja listo para usar.
import { normalizar, letraInicial, memoria } from './util.js';

const comparador = new Intl.Collator('es', { sensitivity: 'base', numeric: true, ignorePunctuation: true });

export async function cargarCanciones() {
  const resp = await fetch('datos/canciones.json', { cache: 'no-cache' });
  if (!resp.ok) throw new Error('No se pudo leer canciones.json');
  const datos = await resp.json();

  // Links que Jorge encontró con el Buscador de links en ESTE navegador
  // (todavía no publicados). Así puede escucharlos antes de subir el archivo.
  const links = memoria.leer('links', {});
  // Videos que fallaron antes en este navegador (borrados o bloqueados).
  const fallas = memoria.leer('fallas', {});

  const canciones = datos.canciones
    .filter(c => c && c.titulo)
    .map(c => {
      const l = links[c.id];
      // Solo cuenta lo que Jorge aprobó a mano (✓ o link pegado); lo demás ya está en canciones.json.
      const elegido = l && l.estado === 'ok' ? l.cand?.[l.i]?.id : null;
      // Videos de esta canción, en orden: el principal y luego los de respaldo.
      const videos = [...new Set([elegido, c.youtubeId, ...(c.alternativos || [])].filter(Boolean))];
      const malos = videosFallados(fallas[c.id]);
      const usables = videos.filter(v => !malos.has(v));
      const f = fallas[c.id];
      return {
        ...c,
        videos,
        youtubeId: usables[0] || videos[0] || '',
        estado: elegido ? 'ok' : c.estado,
        decada: c.decada ?? (c.anio ? Math.floor(c.anio / 10) % 10 * 10 : null),
        letra: letraInicial(c.titulo),
        busqueda: normalizar(`${c.titulo} ${c.artista ?? ''}`),
        // Falla solo si TODOS sus videos fallaron (si Jorge pone uno nuevo, se vuelve a intentar).
        falla: videos.length && !usables.length ? (f?.codigo ?? 150) : null,
      };
    })
    .sort((a, b) => comparador.compare(a.titulo, b.titulo) || comparador.compare(a.artista ?? '', b.artista ?? ''));

  canciones.forEach((c, i) => { c.orden = i; }); // posición A–Z, la usa la cola
  return { canciones };
}

// ¿Se puede reproducir? Necesita un youtubeId y no haber fallado.
export const sePuedeTocar = c => !!c.youtubeId && !c.falla;

// Antes se guardaba { codigo, yt }; ahora { codigo, yts: [...] } (todos los videos que fallaron).
function videosFallados(f) {
  if (!f) return new Set();
  return new Set(f.yts || (f.yt ? [f.yt] : []));
}

// Marca que el video actual falló. Si la canción tiene otro video de respaldo,
// lo deja listo y lo devuelve; si ya no le queda ninguno, la canción queda con falla.
export function marcarFalla(cancion, codigo) {
  const fallas = memoria.leer('fallas', {});
  const malos = videosFallados(fallas[cancion.id]);
  malos.add(cancion.youtubeId);
  fallas[cancion.id] = { codigo, yts: [...malos] };
  memoria.guardar('fallas', fallas);
  const siguiente = (cancion.videos || []).find(v => !malos.has(v)) || null;
  if (siguiente) cancion.youtubeId = siguiente;
  else cancion.falla = codigo;
  return siguiente;
}

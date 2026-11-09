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
      const elegido = l && l.estado !== 'ninguna' ? l.cand?.[l.i]?.id : null;
      const youtubeId = elegido || c.youtubeId;
      const f = fallas[c.id];
      return {
        ...c,
        youtubeId,
        estado: elegido ? (l.estado === 'ok' ? 'ok' : 'por verificar') : c.estado,
        decada: c.decada ?? (c.anio ? Math.floor(c.anio / 10) % 10 * 10 : null),
        letra: letraInicial(c.titulo),
        busqueda: normalizar(`${c.titulo} ${c.artista ?? ''}`),
        // La falla cuenta solo si es del mismo video (si Jorge cambió el link, se vuelve a intentar).
        falla: f && f.yt === youtubeId ? f.codigo : null,
      };
    })
    .sort((a, b) => comparador.compare(a.titulo, b.titulo) || comparador.compare(a.artista ?? '', b.artista ?? ''));

  canciones.forEach((c, i) => { c.orden = i; }); // posición A–Z, la usa la cola
  return { canciones };
}

// ¿Se puede reproducir? Necesita un youtubeId y no haber fallado.
export const sePuedeTocar = c => !!c.youtubeId && !c.falla;

export function marcarFalla(cancion, codigo) {
  cancion.falla = codigo;
  const fallas = memoria.leer('fallas', {});
  fallas[cancion.id] = { codigo, yt: cancion.youtubeId };
  memoria.guardar('fallas', fallas);
}

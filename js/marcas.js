// Reportes de canciones («🚩 Reportar») desde el navegador.
// Se envían a /api/marcas (Vercel). Si no hay internet o la base aún no está conectada,
// se guardan en este equipo y se vuelven a enviar solos en la próxima visita.
import { memoria } from './util.js';

const API = new URL('../api/marcas', import.meta.url).href; // funciona desde / y desde /editor/

export const MOTIVOS = {
  'otra-cancion': '🎵 Es otra canción',
  'video-equivocado': '📺 El video está mal o es otro cantante',
  'no-suena': '🔇 No suena o se corta',
  'mala-calidad': '📉 Se oye o se ve mal',
  'otro': '✏️ Otra cosa',
  'bloqueada': '⛔ YouTube no la deja tocar aquí',
};

// Explica en palabras simples por qué no se pudo enviar (para saber qué arreglar).
function explicar(status, j) {
  if (status === 404 || status === 405 || status === 501) return 'esta página no tiene la base de datos (¿abrió el link de Vercel?)';
  if (status === 503) return j?.mensaje || 'falta conectar la base de datos en Vercel';
  if (status === 401 || status === 403) return 'Vercel pidió iniciar sesión (protección del proyecto)';
  return `${j?.mensaje || 'error'} (código ${status})`;
}

export async function enviarMarca(datos) {
  let detalle = '';
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    if (r.ok) return { compartida: true };
    const j = await r.json().catch(() => null);
    if (r.status === 400) return { error: true, detalle: j?.mensaje || 'datos incompletos' };
    detalle = explicar(r.status, j);
  } catch (e) {
    detalle = navigator.onLine === false ? 'no hay internet' : 'el navegador bloqueó el envío (¿un bloqueador de anuncios?)';
  }
  console.warn('🚩 No se pudo enviar el reporte:', detalle, 'a', API);
  const pend = memoria.leer('marcasPendientes', []);
  pend.push({ ...datos, fecha: new Date().toISOString() });
  memoria.guardar('marcasPendientes', pend.slice(-300));
  return { compartida: false, detalle };
}

// Envía lo que quedó guardado en este equipo.
export async function enviarPendientes() {
  const pend = memoria.leer('marcasPendientes', []);
  if (!pend.length) return;
  const quedan = [];
  for (const m of pend) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) });
      if (!r.ok && r.status !== 400) quedan.push(m);
    } catch { quedan.push(m); }
  }
  memoria.guardar('marcasPendientes', quedan);
}

// Todas las marcas: las compartidas + las que siguen solo en este equipo.
// Devuelve { marcas: Map(id → marca), compartidas: bool, motivo? }
export async function leerMarcas() {
  const mapa = new Map();
  let compartidas = false, motivo = '';
  try {
    const r = await fetch(API, { cache: 'no-store' });
    const j = await r.json();
    if (r.ok) { compartidas = true; for (const m of j.marcas) mapa.set(m.id, m); }
    else motivo = j.mensaje || '';
  } catch { motivo = 'No hay conexión con la base de datos.'; }
  for (const p of memoria.leer('marcasPendientes', [])) {
    const m = mapa.get(p.id) || { id: p.id, titulo: p.titulo, artista: p.artista, yt: p.yt, veces: 0, motivos: {}, notas: [], soloAqui: true };
    m.veces += 1;
    m.motivos[p.motivo] = (m.motivos[p.motivo] || 0) + 1;
    if (p.nota) m.notas.push({ nota: p.nota, fecha: p.fecha });
    m.ultima = p.fecha;
    mapa.set(p.id, m);
  }
  return { marcas: mapa, compartidas, motivo };
}

export async function quitarMarca(id, clave) {
  // Las que están solo en este equipo se quitan aquí mismo.
  memoria.guardar('marcasPendientes', memoria.leer('marcasPendientes', []).filter(m => m.id !== id));
  try {
    const r = await fetch(`${API}?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-editor-clave': clave } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { ok: false, mensaje: j.mensaje || 'No se pudo quitar.' };
  } catch {
    return { ok: false, mensaje: 'No hay conexión con la base de datos.' };
  }
}

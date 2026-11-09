// Buscador de links: busca en YouTube «artista + canción» para cada canción
// que no tiene link, propone el mejor video y deja que Jorge lo apruebe.
// Todo se guarda en este navegador (localStorage) hasta descargar canciones.json.
import { memoria, normalizar } from '../js/util.js';

const API = 'https://www.googleapis.com/youtube/v3';
const $ = id => document.getElementById(id);

let datos;               // el canciones.json original, tal cual
let canciones = [];      // datos.canciones
let links = memoria.leer('links', {});     // { idCancion: { cand: [...], i, estado } }
let fallas = memoria.leer('fallas', {});   // videos que fallaron en la radiola
let ver = 'dudosa';
let parar = false;

// ─────────── Arranque ───────────
init().catch(e => mensaje('No pude leer canciones.json: ' + e.message, true));

async function init() {
  const r = await fetch('../datos/canciones.json', { cache: 'no-cache' });
  datos = await r.json();
  canciones = datos.canciones;

  // Si un video elegido falló en la radiola, vuelve a "dudosa".
  for (const [id, f] of Object.entries(fallas)) {
    const l = links[id];
    if (l && f?.yt && l.cand[l.i]?.id === f.yt && l.estado !== 'ninguna') {
      l.estado = 'dudosa';
      l.cand[l.i].malas = [...new Set([...(l.cand[l.i].malas || []), 'falló en la radiola'])];
    }
  }
  guardarLinks();

  $('clave').value = memoria.leer('clave', '') ? '••••••••••••' : '';
  mostrarEstadoClave();
  conectar();
  pintarResumen();
  elegirVista();
}

// Muestra el primer grupo que tenga canciones: dudosas → probables → aprobadas.
function elegirVista() {
  const hay = e => Object.values(links).some(l => l.estado === e);
  ver = ['dudosa', 'probable', 'ok', 'ninguna'].find(hay) || 'dudosa';
  document.querySelectorAll('[data-ver]').forEach(o => o.setAttribute('aria-pressed', String(o.dataset.ver === ver)));
  pintarRevision();
}

function conectar() {
  $('form-clave').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('clave').value.trim();
    if (!v || v.startsWith('•')) return;
    memoria.guardar('clave', v);
    $('clave').value = '••••••••••••';
    mostrarEstadoClave();
  });
  $('btn-olvidar').addEventListener('click', () => {
    memoria.guardar('clave', '');
    $('clave').value = '';
    mostrarEstadoClave();
  });
  $('btn-buscar').addEventListener('click', buscarTanda);
  $('btn-parar').addEventListener('click', () => { parar = true; });

  document.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-ver]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    ver = b.dataset.ver;
    pintarRevision();
  }));
  $('filtro-texto').addEventListener('input', pintarRevision);
  $('revision').addEventListener('click', accionFila);
  $('revision').addEventListener('submit', linkManual);

  $('archivo-pc').addEventListener('change', importarDelPC);
  $('btn-descargar').addEventListener('click', descargar);
  $('btn-copiar').addEventListener('click', copiar);
  $('previa').addEventListener('close', () => { $('previa-iframe').src = 'about:blank'; });
}

function mostrarEstadoClave() {
  const hay = !!memoria.leer('clave', '');
  $('estado-clave').textContent = hay ? '✅ Clave guardada en este navegador.' : 'Todavía no hay clave guardada.';
  $('btn-buscar').disabled = !hay;
}

// ─────────── Cupo del día (se cuenta en hora del Pacífico, como YouTube) ───────────
function diaPacifico() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}
function busquedasHoy() {
  const b = memoria.leer('busquedas', {});
  return b.dia === diaPacifico() ? b.n : 0;
}
function sumarBusqueda() {
  memoria.guardar('busquedas', { dia: diaPacifico(), n: busquedasHoy() + 1 });
}

// ─────────── Llamadas a YouTube ───────────
class ErrorYouTube extends Error {
  constructor(motivo, texto) { super(texto); this.motivo = motivo; }
}

async function pedir(ruta, params) {
  const url = `${API}/${ruta}?${new URLSearchParams({ ...params, key: memoria.leer('clave', '') })}`;
  let r;
  try { r = await fetch(url); } catch { throw new ErrorYouTube('red', 'No hay conexión a internet.'); }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  const motivo = j?.error?.errors?.[0]?.reason || j?.error?.status || String(r.status);
  const textos = {
    quotaExceeded: 'Por hoy se acabó el cupo de YouTube. Vuelva mañana después de las 3 a. m.',
    dailyLimitExceeded: 'Por hoy se acabó el cupo de YouTube. Vuelva mañana después de las 3 a. m.',
    rateLimitExceeded: 'YouTube pide ir más despacio. Intente de nuevo en un minuto.',
    keyInvalid: 'La clave no es válida. Revise que la copió completa.',
    badRequest: 'La clave no es válida. Revise que la copió completa.',
    accessNotConfigured: 'Falta activar «YouTube Data API v3» en Google Cloud.',
    SERVICE_DISABLED: 'Falta activar «YouTube Data API v3» en Google Cloud.',
    ipRefererBlocked: 'La clave no acepta esta página. Revise «Restricciones de sitios web» en Google Cloud.',
    PERMISSION_DENIED: 'La clave no acepta esta página. Revise las restricciones en Google Cloud.',
  };
  throw new ErrorYouTube(motivo, textos[motivo] || `YouTube respondió con un error (${motivo}).`);
}

async function buscarEnYouTube(c) {
  const j = await pedir('search', {
    part: 'snippet', type: 'video', maxResults: 5,
    videoEmbeddable: 'true', videoSyndicated: 'true', regionCode: 'CO',
    relevanceLanguage: c.idioma === 'en' ? 'en' : 'es',
    q: `${c.artista} ${c.titulo}`,
    fields: 'items(id/videoId,snippet(title,channelTitle))',
  });
  sumarBusqueda();
  return (j.items || []).map(it => ({
    id: it.id.videoId,
    titulo: decodificar(it.snippet.title),
    canal: decodificar(it.snippet.channelTitle),
  }));
}

// Detalles (1 unidad del cupo normal, no gasta búsquedas): duración, si se deja incrustar y si se ve en Colombia.
async function detalles(ids, conSnippet = false) {
  if (!ids.length) return {};
  const j = await pedir('videos', {
    part: conSnippet ? 'snippet,contentDetails,status' : 'contentDetails,status',
    id: ids.join(','),
    fields: `items(id,${conSnippet ? 'snippet(title,channelTitle),' : ''}contentDetails(duration,regionRestriction),status(embeddable,privacyStatus))`,
  });
  return Object.fromEntries((j.items || []).map(v => [v.id, v]));
}

// ─────────── Elegir el mejor video ───────────
const MALAS = [
  [/karaoke/, 'karaoke'], [/\bcover\b|version de|versión de/, 'cover'], [/instrumental/, 'instrumental'],
  [/tutorial|acordes|chords|como tocar|cómo tocar|piano|guitarra/, 'tutorial'],
  [/reacci|react/, 'reacción'], [/remix/, 'remix'],
  [/mix\b|exitos|éxitos|grandes|enganchad|full album|album completo|álbum completo|lo mejor de/, 'recopilación'],
];

function puntuar(c, v, det) {
  const titulo = normalizar(v.titulo), canal = normalizar(v.canal);
  const cancion = normalizar(c.titulo).replace(/[^a-z0-9ñ ]/g, '');
  const artista = normalizar(c.artista).replace(/[^a-z0-9ñ ]/g, '');
  const apellido = artista.split(' ').filter(p => p.length > 3).pop() || artista;
  let p = 0;
  const malas = [];
  if (titulo.replace(/[^a-z0-9ñ ]/g, '').includes(cancion)) p += 4;
  if (titulo.includes(artista) || canal.includes(artista)) p += 3;
  else if (titulo.includes(apellido) || canal.includes(apellido)) p += 2;
  if (/ - topic$/.test(canal)) p += 2;          // canal oficial de audio
  if (/vevo|oficial|official/.test(canal + ' ' + titulo)) p += 1;
  if (/en vivo|live/.test(titulo)) { p -= 1; malas.push('en vivo'); }
  for (const [re, nombre] of MALAS) if (re.test(titulo)) { p -= 5; malas.push(nombre); }

  if (det) {
    const seg = segundos(det.contentDetails?.duration);
    v.dur = seg;
    if (seg && (seg < 90 || seg > 12 * 60)) { p -= 4; malas.push(seg < 90 ? 'muy corto' : 'muy largo'); }
    const rr = det.contentDetails?.regionRestriction;
    if (det.status?.embeddable === false || det.status?.privacyStatus === 'private' ||
        rr?.blocked?.includes('CO') || (rr?.allowed && !rr.allowed.includes('CO'))) {
      p -= 50; malas.push('no se puede usar');
    }
  }
  v.puntos = p;
  v.malas = malas;
  return v;
}

async function procesar(c) {
  const encontrados = await buscarEnYouTube(c);
  const det = await detalles(encontrados.map(v => v.id)).catch(() => ({}));
  const cand = encontrados.map(v => puntuar(c, v, det[v.id]))
    .filter(v => v.puntos > -40)
    .sort((a, b) => b.puntos - a.puntos);
  links[c.id] = {
    cand, i: 0, fecha: new Date().toISOString(),
    estado: !cand.length ? 'ninguna' : cand[0].puntos >= 7 ? 'probable' : 'dudosa',
  };
  guardarLinks();
}

// ─────────── Buscar por tandas ───────────
const pendientes = () => canciones.filter(c => !c.youtubeId && !links[c.id]);

async function buscarTanda() {
  const cupo = 100 - busquedasHoy();
  const n = Math.min(+$('cuantas').value || 95, cupo);
  const lista = pendientes().slice(0, n);
  if (cupo <= 0) return mensaje('Hoy ya se usaron las 100 búsquedas. Vuelva mañana después de las 3 a. m.', true);
  if (!lista.length) return mensaje('¡Ya no quedan canciones por buscar! 🎉');

  parar = false;
  $('btn-buscar').hidden = true;
  $('btn-parar').hidden = false;
  const barra = $('progreso');
  barra.hidden = false; barra.max = lista.length; barra.value = 0;

  let hechas = 0;
  try {
    for (const c of lista) {
      if (parar) { mensaje(`Pausado. Se buscaron ${hechas}.`); break; }
      mensaje(`Buscando ${hechas + 1} de ${lista.length}: ${c.artista} — ${c.titulo}`);
      await procesar(c);
      hechas++;
      barra.value = hechas;
      pintarResumen();
      await esperar(250); // despacio, para no molestar a YouTube
    }
    if (!parar) mensaje(`Listo: se buscaron ${hechas} canciones. Revíselas abajo.`);
  } catch (e) {
    mensaje((e.message || 'Error') + (hechas ? ` (Alcanzó a buscar ${hechas}.)` : ''), true);
    if (e.motivo === 'quotaExceeded' || e.motivo === 'dailyLimitExceeded') memoria.guardar('busquedas', { dia: diaPacifico(), n: 100 });
  } finally {
    $('btn-buscar').hidden = false;
    $('btn-parar').hidden = true;
    pintarResumen();
    elegirVista();
  }
}

// ─────────── Pintar ───────────
function pintarResumen() {
  const cuenta = { probable: 0, dudosa: 0, ok: 0, ninguna: 0 };
  for (const l of Object.values(links)) cuenta[l.estado] = (cuenta[l.estado] || 0) + 1;
  const conOriginal = canciones.filter(c => c.youtubeId && !links[c.id]).length;
  const faltan = pendientes().length;
  const dias = Math.ceil(faltan / 95);
  $('resumen').innerHTML = `
    <span><strong>${canciones.length}</strong> canciones</span>
    <span><strong>${faltan}</strong> por buscar${faltan ? ` (≈ ${dias} día${dias === 1 ? '' : 's'})` : ''}</span>
    <span>✅ <strong>${cuenta.ok + conOriginal}</strong> con link</span>
    <span>🟡 <strong>${cuenta.probable}</strong> probables</span>
    <span>🟠 <strong>${cuenta.dudosa}</strong> dudosas</span>
    <span>⚪ <strong>${cuenta.ninguna}</strong> sin resultado</span>
    <span>Hoy: <strong>${busquedasHoy()}</strong> de 100 búsquedas</span>`;
}

function pintarRevision() {
  const texto = normalizar($('filtro-texto').value);
  const filas = canciones
    .filter(c => links[c.id])
    .filter(c => ver === 'todas' || links[c.id].estado === ver)
    .filter(c => !texto || normalizar(`${c.titulo} ${c.artista}`).includes(texto));
  $('conteo-revision').textContent = filas.length ? `${filas.length} canciones` : 'No hay canciones en este grupo.';
  $('revision').innerHTML = filas.map(filaHTML).join('');
}

function filaHTML(c) {
  const l = links[c.id];
  const v = l.cand[l.i];
  const candidata = v ? `
    <div class="candidata">
      <img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy">
      <div>
        <div class="candidata__titulo">${esc(v.titulo)}</div>
        <div class="candidata__info">${esc(v.canal || '')}${v.dur ? ' · ' + reloj(v.dur) : ''}</div>
        <div class="marcas">${(v.malas || []).map(m => `<span class="marca marca--mala">${esc(m)}</span>`).join('')}</div>
      </div>
    </div>` : '<p class="ayuda">YouTube no encontró un video que se pueda usar. Pegue un link a mano.</p>';
  return `<li class="fila-rev" data-id="${c.id}" data-estado="${l.estado}">
    <div class="fila-rev__cancion"><strong>${esc(c.titulo)}</strong><small>${esc(c.artista)}</small>
      <small>${{ ok: '✅ Aprobada', probable: '🟡 Probable', dudosa: '🟠 Dudosa', ninguna: '⚪ Sin link' }[l.estado]}</small></div>
    <div>${candidata}</div>
    <div class="acciones">
      ${v ? `<button class="boton boton--crema" data-accion="escuchar">▶ Escuchar</button>` : ''}
      ${l.cand.length > 1 ? `<button class="boton boton--crema" data-accion="otra">🔄 Otra opción (${l.i + 1} de ${l.cand.length})</button>` : ''}
      ${v && l.estado !== 'ok' ? `<button class="boton boton--ok" data-accion="ok">✓ Sí es esta</button>` : ''}
      ${l.estado !== 'ninguna' ? `<button class="boton boton--crema" data-accion="ninguna">✗ Ninguna sirve</button>` : ''}
    </div>
    <form class="manual">
      <input name="link" type="url" inputmode="url" placeholder="…o pegue aquí un link de YouTube" aria-label="Link de YouTube para ${esc(c.titulo)}">
      <button class="boton boton--crema">Usar este link</button>
    </form>
  </li>`;
}

// ─────────── Acciones de cada fila ───────────
function accionFila(e) {
  const b = e.target.closest('button[data-accion]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const l = links[id];
  const accion = b.dataset.accion;
  if (accion === 'escuchar') {
    $('previa-titulo').textContent = l.cand[l.i].titulo;
    $('previa-iframe').src = `https://www.youtube-nocookie.com/embed/${l.cand[l.i].id}?autoplay=1&rel=0`;
    $('previa').showModal();
    return;
  }
  if (accion === 'otra') { l.i = (l.i + 1) % l.cand.length; if (l.estado === 'ok') l.estado = 'dudosa'; }
  if (accion === 'ok') l.estado = 'ok';
  if (accion === 'ninguna') l.estado = 'ninguna';
  guardarLinks();
  refrescarFila(id);
  pintarResumen();
}

async function linkManual(e) {
  e.preventDefault();
  const li = e.target.closest('[data-id]');
  const id = li.dataset.id;
  const yt = sacarId(e.target.link.value);
  if (!yt) { alertaFila(li, 'Ese link no parece de YouTube.'); return; }
  const c = canciones.find(x => x.id === id);
  let v = { id: yt, titulo: '(link pegado a mano)', canal: '', puntos: 99, malas: [] };
  try {
    const det = await detalles([yt], true);
    if (det[yt]) v = puntuar(c, { id: yt, titulo: det[yt].snippet.title, canal: det[yt].snippet.channelTitle }, det[yt]);
    else v.malas = ['no se encontró el video'];
  } catch { /* sin clave o sin internet: se usa igual */ }
  const l = links[id] || (links[id] = { cand: [], i: 0 });
  l.cand = [v, ...l.cand.filter(x => x.id !== yt)];
  l.i = 0;
  l.estado = 'ok';
  guardarLinks();
  refrescarFila(id);
  pintarResumen();
}

function refrescarFila(id) {
  const li = $('revision').querySelector(`[data-id="${id}"]`);
  const c = canciones.find(x => x.id === id);
  if (li) li.outerHTML = filaHTML(c);
}

function alertaFila(li, texto) {
  const p = document.createElement('p');
  p.className = 'mensaje mensaje--error';
  p.textContent = texto;
  li.append(p);
  setTimeout(() => p.remove(), 4000);
}

// ─────────── Traer lo que encontró el buscador del PC ───────────
async function importarDelPC(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    const de_pc = JSON.parse(await archivo.text());
    let nuevas = 0;
    for (const [id, r] of Object.entries(de_pc)) {
      if (!r || !Array.isArray(r.cand)) continue;
      if (links[id]?.estado === 'ok') continue; // lo que Jorge ya aprobó no se toca
      links[id] = r;
      nuevas++;
    }
    guardarLinks();
    pintarResumen();
    elegirVista();
    mensaje(`📂 Se trajeron ${nuevas} canciones del computador. Revise las dudosas.`);
  } catch {
    mensaje('Ese archivo no es el de resultados (links_encontrados.json).', true);
  }
  e.target.value = '';
}

// ─────────── Guardar / exportar ───────────
function guardarLinks() { memoria.guardar('links', links); }

function jsonFinal() {
  const out = structuredClone(datos);
  out.actualizado = new Date().toISOString().slice(0, 10);
  for (const c of out.canciones) {
    const l = links[c.id];
    if (!l) continue;
    if (l.estado === 'ninguna' || !l.cand[l.i]) {
      c.youtubeId = ''; c.estado = 'sin link';
    } else {
      c.youtubeId = l.cand[l.i].id;
      c.estado = l.estado === 'ok' ? 'ok' : 'por verificar';
    }
  }
  return JSON.stringify(out, null, 1);
}

function descargar() {
  const blob = new Blob([jsonFinal()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'canciones.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  $('mensaje-guardar').textContent = '⬇ Descargado. Ahora reemplace datos/canciones.json en GitHub.';
}

async function copiar() {
  try {
    await navigator.clipboard.writeText(jsonFinal());
    $('mensaje-guardar').textContent = '📋 Copiado. Péguelo en datos/canciones.json en GitHub.';
  } catch {
    $('mensaje-guardar').textContent = 'No se pudo copiar. Use «Descargar».';
  }
}

// ─────────── Utilidades ───────────
function mensaje(t, error = false) {
  $('mensaje').textContent = t;
  $('mensaje').classList.toggle('mensaje--error', error);
}
const esperar = ms => new Promise(r => setTimeout(r, ms));

function decodificar(t) {
  const el = document.createElement('textarea');
  el.innerHTML = t;
  return el.value;
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// "PT4M13S" → 253
function segundos(iso = '') {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
const reloj = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Acepta youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/… o el código solo.
export function sacarId(texto = '') {
  const t = texto.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = /(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/.exec(t);
  return m ? m[1] : null;
}

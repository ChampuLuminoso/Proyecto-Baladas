// Punto de arranque: une la lista, la cola y el reproductor.
import { cargarCanciones, sePuedeTocar, marcarFalla } from './datos.js';
import { crearReproductor, ESTADO, ERRORES } from './reproductor.js';
import { Cancionero } from './lista.js';
import { Cola } from './cola.js';
import { formatoTiempo, memoria, avisar } from './util.js';

const $ = id => document.getElementById(id);

let canciones = [];
let cancionero, cola, reproductor;
let sonando = false;
let fallasSeguidas = 0;
let arrastrandoProgreso = false;
let volumen = memoria.leer('volumen', 70);

// El reproductor empieza a cargar de una vez (eso no necesita toque);
// lo que necesita toque es el primer "play".
const promesaReproductor = crearReproductor('yt', {
  alCambiarEstado: cambioDeEstado,
  alFallar: fallaDeVideo,
});

iniciar().catch(err => {
  console.error(err);
  avisar('No pudimos cargar la lista de canciones. Revise la conexión y recargue la página.', 10000);
});

async function iniciar() {
  const datos = await cargarCanciones();
  canciones = datos.canciones;

  cancionero = new Cancionero(canciones, {
    alElegir: c => {
      if (!sePuedeTocar(c)) {
        avisar(c.falla ? 'Esta canción tiene el link dañado. Jorge debe revisarla.' : 'Esta canción todavía no tiene link de YouTube.');
        return;
      }
      tocar(cola.empezarEn(c));
      mostrarModo();
    },
    alCambiarFiltro: dibujarCola,
  });
  cola = new Cola(() => canciones.filter(c => sePuedeTocar(c) && cancionero.pasaFiltros(c)));
  // Mientras menos de la mitad tenga link, mostramos la lista completa (para que Jorge la revise).
  if (canciones.filter(sePuedeTocar).length < canciones.length / 2) {
    $('ver-sin-link').checked = true;
    cancionero.filtro.verSinLink = true;
  }
  cancionero.dibujar();
  dibujarCola();
  conectarControles();
  aplicarVolumen(volumen);
  aplicarVista(memoria.leer('vista', 'video'));
}

// ─────────── Reproducir ───────────
async function tocar(c) {
  if (!c) { avisar('No hay canciones para tocar con este filtro.'); return; }
  reproductor = await promesaReproductor;
  $('aviso-vista-previa').hidden = !reproductor.falso;
  reproductor.volumen(volumen);
  reproductor.cargar(c.youtubeId);

  $('ahora-titulo').textContent = c.titulo;
  $('ahora-artista').textContent = [c.artista, c.anio].filter(Boolean).join(' · ');
  $('disco-texto').textContent = c.anio ? `’${String(c.anio).slice(2)}` : 'DJ';
  document.title = `♪ ${c.titulo} · DJ Jorge Montes`;
  cancionero.marcarActual(c.id);
  dibujarCola();

  // En iPhone a veces YouTube exige un toque directo sobre el video.
  $('pista-iphone').hidden = true;
  clearTimeout(tocar.revisar);
  tocar.revisar = setTimeout(() => {
    if (cola.actual === c && reproductor.estado() !== ESTADO.SONANDO && reproductor.estado() !== ESTADO.PAUSA) {
      $('pista-iphone').hidden = false;
      aplicarVista('video');
    }
  }, 4000);
}

function siguiente() { tocar(cola.siguiente()); }

function anterior() {
  // Como en las radios: si ya avanzó, "anterior" vuelve al comienzo.
  if (reproductor && reproductor.tiempo() > 5) { reproductor.irA(0); return; }
  tocar(cola.anterior());
}

async function playPausa() {
  if (!cola.actual) { tocar(cola.siguiente()); return; }
  reproductor = await promesaReproductor;
  sonando ? reproductor.pausar() : reproductor.tocar();
}

function sorpresa() {
  tocar(cola.empezarSorpresa());
  mostrarModo();
  avisar('🎲 Modo sorpresa: canciones al azar, sin repetir.');
}

function cambioDeEstado(estado) {
  if (estado === ESTADO.SONANDO) {
    sonando = true;
    fallasSeguidas = 0;
    $('pista-iphone').hidden = true;
  } else if (estado === ESTADO.PAUSA || estado === ESTADO.TERMINO || estado === -1) {
    sonando = false;
  }
  for (const b of [$('btn-play'), $('m-play')]) {
    b.textContent = sonando ? '⏸' : '▶';
    b.setAttribute('aria-label', sonando ? 'Pausar' : 'Reproducir');
  }
  document.querySelectorAll('.tocadiscos .disco').forEach(d => d.classList.toggle('disco--girando', sonando));
  document.body.classList.toggle('sonando', sonando);

  if (estado === ESTADO.TERMINO) siguiente(); // reproducción continua
}

function fallaDeVideo(codigo) {
  const c = cola.actual;
  if (!c) return;
  marcarFalla(c, codigo);
  fallasSeguidas++;
  cancionero.dibujar();
  console.warn(`Video con problema: "${c.titulo}" (${c.youtubeId}) → error ${codigo}: ${ERRORES[codigo] ?? 'desconocido'}`);
  if (fallasSeguidas >= 5) {
    avisar('Varias canciones seguidas no se pudieron tocar. Revise la conexión a internet.', 8000);
    return;
  }
  avisar(`«${c.titulo}» no está disponible. Pasamos a la siguiente…`);
  setTimeout(siguiente, 1500);
}

// ─────────── Progreso ───────────
setInterval(() => {
  if (!reproductor || arrastrandoProgreso) return;
  const t = reproductor.tiempo(), d = reproductor.duracion();
  $('tiempo-actual').textContent = formatoTiempo(t);
  $('tiempo-total').textContent = formatoTiempo(d);
  const barra = $('barra-progreso');
  barra.max = Math.max(1, Math.floor(d));
  barra.value = Math.floor(t);
  barra.style.setProperty('--avance', d ? `${(t / d) * 100}%` : '0%');
  barra.setAttribute('aria-valuetext', `${formatoTiempo(t)} de ${formatoTiempo(d)}`);
}, 500);

// ─────────── Volumen ───────────
function aplicarVolumen(v) {
  volumen = Math.max(0, Math.min(100, Math.round(v)));
  $('barra-volumen').value = volumen;
  $('barra-volumen').style.setProperty('--avance', `${volumen}%`);
  $('barra-volumen').setAttribute('aria-valuetext', `${volumen} por ciento`);
  reproductor?.volumen(volumen);
  memoria.guardar('volumen', volumen);
}

// ─────────── Video grande / solo música ───────────
function aplicarVista(vista) {
  $('escenario').dataset.vista = vista;
  $('btn-ver-video').setAttribute('aria-pressed', String(vista === 'video'));
  $('btn-solo-musica').setAttribute('aria-pressed', String(vista === 'musica'));
  memoria.guardar('vista', vista);
}

// ─────────── Cola "A continuación" ───────────
function dibujarCola() {
  const prox = cola.proximas(3);
  $('cola').innerHTML = prox.length
    ? prox.map((c, i) => `<li><span class="cola__num">${i + 1}</span><span><strong>${esc(c.titulo)}</strong><small>${esc(c.artista ?? '')}</small></span></li>`).join('')
    : '<li class="cola__vacia">Elija una canción para empezar</li>';
}

function mostrarModo() {
  const sorpresaActiva = cola.modo === 'sorpresa';
  $('btn-orden').hidden = !sorpresaActiva;
  $('rotulo-modo').textContent = sorpresaActiva ? '🎲 Sorpresa · Ahora suena' : 'Ahora suena';
  document.body.classList.toggle('modo-sorpresa', sorpresaActiva);
  dibujarCola();
}

// ─────────── Botones y teclado ───────────
function conectarControles() {
  const cerrarBienvenida = () => $('bienvenida').classList.add('bienvenida--cerrada');
  $('btn-empezar-sorpresa').addEventListener('click', () => { cerrarBienvenida(); sorpresa(); });
  $('btn-empezar-lista').addEventListener('click', () => { cerrarBienvenida(); $('buscar').focus({ preventScroll: true }); });

  $('btn-play').addEventListener('click', playPausa);
  $('m-play').addEventListener('click', playPausa);
  $('btn-siguiente').addEventListener('click', siguiente);
  $('m-siguiente').addEventListener('click', siguiente);
  $('btn-anterior').addEventListener('click', anterior);
  $('m-anterior').addEventListener('click', anterior);
  $('btn-sorpresa').addEventListener('click', sorpresa);
  $('m-sorpresa').addEventListener('click', sorpresa);
  $('btn-orden').addEventListener('click', () => { cola.volverAlOrden(); mostrarModo(); avisar('Seguimos en orden A–Z.'); });

  $('btn-vol-menos').addEventListener('click', () => aplicarVolumen(volumen - 10));
  $('btn-vol-mas').addEventListener('click', () => aplicarVolumen(volumen + 10));
  $('barra-volumen').addEventListener('input', e => aplicarVolumen(+e.target.value));

  const barra = $('barra-progreso');
  barra.addEventListener('pointerdown', () => { arrastrandoProgreso = true; });
  barra.addEventListener('input', () => { $('tiempo-actual').textContent = formatoTiempo(+barra.value); });
  barra.addEventListener('change', () => { reproductor?.irA(+barra.value); arrastrandoProgreso = false; });

  $('btn-ver-video').addEventListener('click', () => aplicarVista('video'));
  $('btn-solo-musica').addEventListener('click', () => aplicarVista('musica'));

  document.addEventListener('keydown', e => {
    const enCampo = e.target.closest('input, textarea, select, button, [contenteditable]');
    if (e.key === ' ' && !enCampo) { e.preventDefault(); playPausa(); }
    if (e.target.closest('input')) return; // las flechas mueven las barras
    if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
  });
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

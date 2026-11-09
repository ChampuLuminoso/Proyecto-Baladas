// Dibuja el cancionero: índice de letras, buscador, décadas y la lista A–Z.
import { normalizar } from './util.js';
import { sePuedeTocar } from './datos.js';

const LETRAS = '#ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');

export class Cancionero {
  constructor(canciones, { alElegir, alCambiarFiltro }) {
    this.canciones = canciones;
    this.alElegir = alElegir;
    this.alCambiarFiltro = alCambiarFiltro;
    this.filtro = { texto: '', decada: 'todas', idioma: 'todas', verSinLink: false };
    this.idActual = null;

    this.$lista = document.getElementById('lista');
    this.$letras = document.getElementById('letras');
    this.$conteo = document.getElementById('conteo');

    // Buscador: filtra mientras se escribe.
    document.getElementById('buscar').addEventListener('input', e => {
      this.filtro.texto = normalizar(e.target.value);
      this.dibujar();
    });

    // Botones de década.
    document.querySelectorAll('.decada').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.decada').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      this.filtro.decada = b.dataset.decada;
      this.dibujar();
      this.alCambiarFiltro?.();
    }));

    // Botones de idioma.
    document.querySelectorAll('.idioma').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.idioma').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
      this.filtro.idioma = b.dataset.idioma;
      this.dibujar();
      this.alCambiarFiltro?.();
    }));

    // Las décadas solo aparecen cuando las canciones ya tienen año.
    document.getElementById('decadas').hidden = !canciones.some(c => c.decada != null);

    document.getElementById('ver-sin-link').addEventListener('change', e => {
      this.filtro.verSinLink = e.target.checked;
      this.dibujar();
    });

    // Un solo "escuchador" para toda la lista (más rápido que uno por canción).
    this.$lista.addEventListener('click', e => {
      const li = e.target.closest('[data-id]');
      if (!li) return;
      const c = this.canciones.find(x => x.id === li.dataset.id);
      if (c) this.alElegir(c);
    });

    this.$letras.addEventListener('click', e => {
      const b = e.target.closest('button[data-letra]');
      if (!b || b.disabled) return;
      const destino = this.$lista.querySelector(`[data-letra-inicio="${b.dataset.letra}"]`);
      destino?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      destino?.querySelector('button')?.focus({ preventScroll: true });
    });
  }

  // Lo que pasa los filtros de década e idioma (lo usa también la cola).
  pasaFiltros(c) {
    return (this.filtro.decada === 'todas' || String(c.decada) === this.filtro.decada) &&
           (this.filtro.idioma === 'todas' || c.idioma === this.filtro.idioma);
  }

  visibles() {
    return this.canciones.filter(c =>
      this.pasaFiltros(c) &&
      (this.filtro.verSinLink || sePuedeTocar(c) || c.falla) &&
      (!this.filtro.texto || c.busqueda.includes(this.filtro.texto)));
  }

  marcarActual(id) {
    this.idActual = id;
    this.$lista.querySelectorAll('.cancion--actual').forEach(el => el.classList.remove('cancion--actual'));
    const li = this.$lista.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (li) {
      li.classList.add('cancion--actual');
      li.querySelector('button')?.setAttribute('aria-current', 'true');
    }
  }

  dibujar() {
    const lista = this.visibles();
    const presentes = new Set(lista.map(c => c.letra));

    this.$letras.innerHTML = LETRAS.map(l =>
      `<button data-letra="${l}" ${presentes.has(l) ? '' : 'disabled'} aria-label="Letra ${l === '#' ? 'números' : l}">${l}</button>`
    ).join('');

    const sinLink = this.canciones.filter(c => !c.youtubeId && this.pasaFiltros(c)).length;
    this.$conteo.textContent = lista.length === 0
      ? 'No hay canciones con esta búsqueda o filtro.'
      : `${lista.length} ${lista.length === 1 ? 'canción' : 'canciones'}` +
        (sinLink && !this.filtro.verSinLink ? ` · ${sinLink} todavía sin link` : '');

    let letraPrevia = '';
    this.$lista.innerHTML = lista.map(c => {
      const inicio = c.letra !== letraPrevia ? ` data-letra-inicio="${c.letra}"` : '';
      const separador = c.letra !== letraPrevia ? `<li class="lista__letra" aria-hidden="true">${c.letra}</li>` : '';
      letraPrevia = c.letra;
      const tocable = sePuedeTocar(c);
      const marca = this.marcadas?.has(c.id) ? '<span class="sello sello--marcada" title="Reportada: Jorge la revisará">🚩</span>'
        : c.falla ? '<span class="sello sello--falla" title="El video no se pudo reproducir">⚠️ revisar</span>'
        : !c.youtubeId ? '<span class="sello">sin link</span>'
        : c.estado === 'por verificar' ? '<span class="sello sello--verificar" title="Link por verificar">?</span>' : '';
      return `${separador}<li class="cancion${tocable ? '' : ' cancion--apagada'}${c.id === this.idActual ? ' cancion--actual' : ''}" data-id="${c.id}"${inicio}>
        <button class="cancion__boton" ${tocable ? '' : 'aria-disabled="true"'}>
          <span class="cancion__titulo">${escapar(c.titulo)}</span>
          <span class="cancion__detalle">${escapar(c.artista ?? 'Artista desconocido')}${c.anio ? ' · ' + c.anio : ''}</span>
        </button>${marca}
      </li>`;
    }).join('');
  }
}

function escapar(t) {
  return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Decide qué canción sigue.
//  · Modo "orden": sigue el orden A–Z (respetando el filtro de década).
//  · Modo "sorpresa": al azar, SIN repetir hasta que suenen todas.
import { mezclar } from './util.js';

export class Cola {
  // obtenerTocables() devuelve las canciones que se pueden tocar ahora, en orden A–Z.
  constructor(obtenerTocables) {
    this.obtenerTocables = obtenerTocables;
    this.modo = 'orden';
    this.actual = null;
    this.historial = [];
    this.bolsa = []; // canciones pendientes del modo sorpresa
  }

  empezarEn(cancion) {
    if (this.actual) this.historial.push(this.actual);
    this.modo = 'orden';
    this.actual = cancion;
    return cancion;
  }

  empezarSorpresa() {
    this.modo = 'sorpresa';
    this.bolsa = [];
    if (this.actual) this.historial.push(this.actual);
    this.actual = this._sacarDeBolsa();
    return this.actual;
  }

  volverAlOrden() { this.modo = 'orden'; this.bolsa = []; }

  siguiente() {
    const prox = this.modo === 'sorpresa' ? this._sacarDeBolsa() : this._siguienteEnOrden(this.actual);
    if (!prox) return null;
    if (this.actual) this.historial.push(this.actual);
    if (this.historial.length > 200) this.historial.shift();
    this.actual = prox;
    return prox;
  }

  anterior() {
    // En sorpresa volvemos a la que sonó antes; en orden, a la anterior A–Z.
    if (this.modo === 'sorpresa' && this.historial.length) {
      if (this.actual) this.bolsa.unshift(this.actual);
      this.actual = this.historial.pop();
      return this.actual;
    }
    const lista = this.obtenerTocables();
    if (!lista.length) return null;
    const i = this.actual ? lista.findIndex(c => c.orden >= this.actual.orden) : 0;
    const prev = lista[(i <= 0 ? lista.length : i) - 1];
    if (this.actual) this.historial.push(this.actual);
    this.actual = prev;
    return prev;
  }

  // Las próximas n canciones, para mostrar "A continuación".
  proximas(n = 3) {
    if (this.modo === 'sorpresa') {
      this._llenarBolsa(n);
      return this.bolsa.slice(0, n);
    }
    const res = [];
    let c = this.actual;
    const total = this.obtenerTocables().length;
    for (let k = 0; k < Math.min(n, total - (this.actual ? 1 : 0)); k++) {
      c = this._siguienteEnOrden(c);
      if (!c || res.includes(c)) break;
      res.push(c);
    }
    return res;
  }

  // ── por dentro ──
  _siguienteEnOrden(desde) {
    const lista = this.obtenerTocables();
    if (!lista.length) return null;
    if (!desde) return lista[0];
    return lista.find(c => c.orden > desde.orden) ?? lista[0] ?? null; // al final, vuelve a la A
  }

  _llenarBolsa(minimo) {
    const tocables = this.obtenerTocables();
    const validas = new Set(tocables);
    // Quitamos las que ya no aplican (cambió el filtro o fallaron).
    this.bolsa = this.bolsa.filter(c => validas.has(c));
    // Si se acaba, empieza una ronda nueva mezclada (sin repetir la que suena).
    let rondas = 0;
    while (this.bolsa.length < minimo && rondas < 3 && tocables.length) {
      const yaEnBolsa = new Set(this.bolsa);
      const nueva = mezclar(tocables.filter(c => !yaEnBolsa.has(c) && c !== this.actual));
      if (!nueva.length) break;
      this.bolsa.push(...nueva);
      rondas++;
    }
  }

  _sacarDeBolsa() {
    this._llenarBolsa(1);
    if (this.bolsa.length) return this.bolsa.shift();
    // Solo queda la que suena: se repite si todavía se puede tocar.
    return this.actual && this.obtenerTocables().includes(this.actual) ? this.actual : null;
  }
}

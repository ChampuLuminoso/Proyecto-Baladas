// Herramientas pequeñas que usan los demás archivos.

// Quita tildes y pasa a minúsculas: "Perdóname" → "perdoname".
// Así la búsqueda encuentra la canción aunque se escriba sin tilde.
export function normalizar(texto = '') {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Primera letra para el índice A–Z (Á cuenta como A; números y signos van en "#").
export function letraInicial(titulo = '') {
  const l = normalizar(titulo).replace(/^[¿¡"'(«]+/, '').charAt(0).toUpperCase();
  return /[A-ZÑ]/.test(l) ? l : '#';
}

// 125 segundos → "2:05"
export function formatoTiempo(seg) {
  if (!isFinite(seg) || seg < 0) seg = 0;
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Mezcla una lista al azar (algoritmo de Fisher–Yates: justo y rápido).
export function mezclar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// localStorage puede fallar (modo privado, permisos): nunca dejamos que rompa la página.
export const memoria = {
  leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem('djjm.' + clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch { return porDefecto; }
  },
  guardar(clave, valor) {
    try { localStorage.setItem('djjm.' + clave, JSON.stringify(valor)); } catch { /* sin memoria */ }
  },
};

// Mensaje corto en la parte de abajo (también lo leen los lectores de pantalla).
let temporizadorAviso;
export function avisar(texto, ms = 4000) {
  const el = document.getElementById('aviso');
  el.textContent = texto;
  el.classList.add('aviso--visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('aviso--visible'), ms);
}

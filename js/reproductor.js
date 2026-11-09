// Envoltorio del reproductor de YouTube (IFrame Player API).
// El resto de la página solo habla con este archivo, nunca con YouTube directamente.
// Si YouTube no carga (sin internet o vista previa bloqueada), usamos un
// reproductor "de mentira" que imita el avance para poder ver la página.

const ESTADO = { TERMINO: 0, SONANDO: 1, PAUSA: 2, CARGANDO: 3, LISTO: 5 };

// Códigos de error de YouTube explicados en español.
export const ERRORES = {
  2: 'el link está mal escrito',
  5: 'el reproductor tuvo un problema',
  100: 'el video fue borrado o es privado',
  101: 'el dueño no deja ponerlo en otras páginas',
  150: 'el dueño no deja ponerlo en otras páginas',
  153: 'YouTube no recibió el origen de la página',
};

export function crearReproductor(idContenedor, eventos) {
  return new Promise(resolve => {
    let resuelto = false;
    const usarFalso = () => {
      if (resuelto) return;
      resuelto = true;
      resolve(new ReproductorFalso(idContenedor, eventos));
    };

    // Si en 8 segundos YouTube no responde, seguimos sin él.
    const espera = setTimeout(usarFalso, 8000);

    window.onYouTubeIframeAPIReady = () => {
      const yt = new YT.Player(idContenedor, {
        host: 'https://www.youtube-nocookie.com', // versión que rastrea menos
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, controls: 1, fs: 1, iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: () => {
            if (resuelto) return;
            clearTimeout(espera);
            resuelto = true;
            resolve(new ReproductorYouTube(yt, eventos));
          },
          onStateChange: e => eventos.alCambiarEstado?.(e.data),
          onError: e => eventos.alFallar?.(e.data),
        },
      });
    };

    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(espera); usarFalso(); };
    document.head.appendChild(s);
  });
}

class ReproductorYouTube {
  constructor(yt) { this.yt = yt; this.falso = false; }
  cargar(id) { this.yt.loadVideoById(id); }
  tocar() { this.yt.playVideo(); }
  pausar() { this.yt.pauseVideo(); }
  irA(seg) { this.yt.seekTo(seg, true); }
  volumen(v) { this.yt.setVolume(v); if (v > 0) this.yt.unMute(); }
  tiempo() { return this.yt.getCurrentTime?.() ?? 0; }
  duracion() { return this.yt.getDuration?.() ?? 0; }
  estado() { return this.yt.getPlayerState?.() ?? -1; }
}

// Imita a YouTube: avanza el tiempo, termina a los 3:30, no suena.
class ReproductorFalso {
  constructor(idContenedor, eventos) {
    this.falso = true;
    this.eventos = eventos;
    this.t = 0; this.d = 210; this.st = -1; this.reloj = null;
    document.getElementById(idContenedor).innerHTML =
      '<div class="video-falso"><span>📺</span><small>Aquí va el video de YouTube</small></div>';
  }
  _estado(s) { this.st = s; this.eventos.alCambiarEstado?.(s); }
  cargar() { this.t = 0; this.tocar(); }
  tocar() {
    clearInterval(this.reloj);
    this._estado(ESTADO.SONANDO);
    this.reloj = setInterval(() => {
      this.t += 0.5;
      if (this.t >= this.d) { clearInterval(this.reloj); this._estado(ESTADO.TERMINO); }
    }, 500);
  }
  pausar() { clearInterval(this.reloj); this._estado(ESTADO.PAUSA); }
  irA(seg) { this.t = seg; }
  volumen() {}
  tiempo() { return this.t; }
  duracion() { return this.st === -1 ? 0 : this.d; }
  estado() { return this.st; }
}

export { ESTADO };

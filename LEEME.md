# DJ Jorge Montes · Baladas de siempre

Radiola web con baladas de los 60, 70, 80 y 90. Es HTML, CSS y JavaScript puro: no hay que compilar nada.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | La única página: bienvenida, tocadiscos, cancionero y cola |
| `css/estilos.css` | Diseño retro y adaptación a celular, tablet y computador |
| `js/app.js` | Arranque: une todo y maneja botones y teclado |
| `js/reproductor.js` | Habla con YouTube (IFrame Player API) y detecta errores |
| `js/cola.js` | Decide qué sigue: orden A–Z o sorpresa sin repetir |
| `js/lista.js` | Lista A–Z, índice de letras, buscador y décadas |
| `js/datos.js` | Lee `datos/canciones.json` y recuerda los videos que fallaron |
| `editor/links.html` | **Buscador de links** (solo para Jorge): busca en YouTube «artista + canción» |
| `herramientas/BUSCAR_LINKS.bat` | **Buscador del PC** (Windows): busca todos los links de una vez, sin clave |
| `herramientas/buscar_links.py` | El programa que usa el .bat (también sirve en Mac) |
| `js/util.js` | Herramientas pequeñas (tildes, tiempo, mezclar, memoria) |
| `datos/canciones.json` | Las 622 canciones del Excel de Jorge, ya limpias (614 con link «por verificar», 8 sin link) |

## Formato de cada canción
```json
{
  "id": "c001",
  "titulo": "El triste",
  "artista": "José José",
  "anio": 1970,
  "decada": 70,
  "idioma": "es",
  "genero": "Balada",
  "youtubeId": "YQqZ-TstZdo",
  "estado": "por verificar",
  "nota": ""
}
```
- `youtubeId` es lo que va después de `watch?v=` en el link de YouTube.
- `idioma` es `es` (español) o `en` (inglés). `anio` y `decada` pueden ir en `null` mientras no se sepan: los botones de década aparecen solos cuando haya años.
- `estado` puede ser `ok`, `por verificar` o `sin link`.
- Las canciones sin `youtubeId` no se muestran a quien escucha. Para verlas, marque «Mostrar canciones sin link».

## Probar en el computador
El navegador no deja leer `canciones.json` si abre `index.html` con doble clic. Use un servidor pequeño:
- **VS Code:** instale la extensión *Live Server* → clic derecho en `index.html` → *Open with Live Server*.
- **o con Python:** `python -m http.server 8000` y abra http://localhost:8000

## Teclado
Espacio = pausa/reproducir · ← anterior · → siguiente.

## Buscador del PC (el más rápido) · herramientas/
Busca «artista + canción» para todas las canciones sin link, **sin clave y sin límite diario**
(unos 30–40 minutos para las 622). No descarga videos ni audio: solo lee el resultado de la búsqueda.

**Windows**
1. Instale Python desde https://www.python.org/downloads/ (marque **«Add python.exe to PATH»**).
2. Doble clic en `herramientas/BUSCAR_LINKS.bat`. La primera vez instala la herramienta yt-dlp.
3. Déjelo trabajar. Puede cerrarlo cuando quiera: al abrirlo de nuevo sigue donde iba.

**Mac**: en la Terminal, dentro de la carpeta del proyecto:
`python3 -m pip install -U yt-dlp` y luego `python3 herramientas/buscar_links.py`

Al terminar:
- Los links quedan en `datos/canciones.json` como «por verificar» (antes guarda `canciones.respaldo.json`).
- Para revisar las dudosas: abra `editor/links.html` → **📂 Abrir resultados del computador** →
  elija `herramientas/links_encontrados.json`.
- Para volver a buscar las 🟠 dudosas y ⚪ sin resultado con otras palabras («letra», «audio»):
  doble clic en `herramientas/REINTENTAR_DUDOSAS.bat`.
- Si YouTube pide «confirmar que no es un robot», el programa se detiene solo. Espere una o dos horas y vuelva a abrirlo.

> Nota honesta: las reglas de YouTube solo permiten leer su sitio con programas usando su API oficial
> (el Buscador de la web, con clave). Este programa va despacio, como una persona, y no descarga nada,
> pero técnicamente no es la vía oficial. Úselo para esta lista personal y no lo comparta como servicio.

## Buscador de links con clave (editor/links.html)
Busca en YouTube «artista + canción» para cada canción sin link y propone el mejor video.
Solo acepta videos que se pueden poner en otras páginas y que se ven en Colombia, y
descuenta puntos a karaokes, covers, recopilaciones y videos muy cortos o muy largos.

### 1. Sacar la clave de YouTube (gratis, una sola vez)
1. Entre a https://console.cloud.google.com con su cuenta de Gmail.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre: `DJ Jorge Montes` → **Crear**.
3. Menú ☰ → **APIs y servicios** → **Biblioteca** → busque **YouTube Data API v3** → **Habilitar**.
4. **APIs y servicios** → **Credenciales** → **Crear credenciales** → **Clave de API**. Cópiela (empieza por `AIza…`).
5. Proteja la clave (clic en ella → **Editar**):
   - **Restricciones de API** → *Restringir clave* → marque solo **YouTube Data API v3**.
   - **Restricciones de aplicaciones** → *Sitios web* → agregue:
     `https://SU-LINK.vercel.app/*`, `http://localhost:5500/*` y `http://127.0.0.1:5500/*`
   - **Guardar**. Los cambios pueden tardar unos minutos.

> La clave se pega en la página del buscador y queda **solo en ese navegador**.
> Nunca la ponga dentro de los archivos del proyecto ni la suba a GitHub.

### 2. Usarlo
- Abra `editor/links.html` (en Vercel: `https://SU-LINK.vercel.app/editor/links`).
- Pegue la clave → **Guardar clave** → **🔎 Buscar las siguientes** (95 por día).
- YouTube da **100 búsquedas al día**; el cupo se renueva a las **3 a. m. hora de Colombia**.
  Las 622 canciones toman unos 7 días. Lo encontrado queda guardado en el navegador.
- Revise: **▶ Escuchar**, **🔄 Otra opción**, **✓ Sí es esta**, **✗ Ninguna sirve**,
  o pegue un link a mano.
- Lo encontrado ya suena en la radiola de **ese mismo navegador**.
- Para que suene en todos lados: **⬇ Descargar canciones.json** → reemplace `datos/canciones.json`
  en GitHub → Vercel publica solo.

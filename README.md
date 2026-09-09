# Filtros de dibujo en tiempo real (WebGL / Three.js)

SPA 100 % client-side que captura la cámara trasera del móvil y procesa el
video en GPU con shaders GLSL propios sobre Three.js. Incluye un modo AR de
**«dibujo en el aire»**: dibuja con la punta del índice sobre la imagen de la
cámara, donde el gesto de **pellizcar** (pulgar + índice) baja y sube el lápiz.

**Filtros incluidos:** Boceto a lápiz (Sobel + sombreado de grafito),
Blueprint arquitectónico (cianotipo con rejilla), Cómic / cel-shading
(posterizado + tinta), Matrix (lluvia de katakana alimentada por la cámara)
y vista normal. *(El filtro Polígonos existe en el código pero está oculto
de la barra temporalmente: ver el comentario en `js/filters.js`.)*

---

## Estructura del proyecto

HTML, CSS y JS están separados, y el JS está modularizado con ES modules
(sin build ni bundler). Three.js se carga vía CDN con un *import map*
declarado en `index.html` (único sitio donde se fija la versión):

```
index.html            Solo marcado + import map + carga de js/main.js
css/
  base.css            Reset, documento, canvas WebGL y <video> oculto
  hud.css             Barra de filtros, panel de opciones y chip de FPS
  overlay.css         Overlay de arranque / error (spinner, botón primario)
js/
  main.js             Punto de entrada: flujos de cámara, reintento y arranque
  config.js           CONFIG global y flags de URL (?debug, ?demo)
  app.js              Motor Three.js (clase App): renderer, escena, materiales
  filters.js          Registro de filtros (label, icono, uniforms, fragment)
  icons.js            Iconos SVG inline
  shaders/
    common.js         Vertex shader + prelude GLSL compartido (coverUv, sobel…)
    normal.js         Filtro: vista sin procesar
    sketch.js         Filtro: boceto a lápiz
    blueprint.js      Filtro: blueprint / cianotipo
    comic.js          Filtro: cómic / cel-shading
    matrix.js         Filtro: matrix (lluvia de glifos + atlas de canvas 2D)
    polygons.js       Filtro: polígonos (malla jittereada de triángulos planos)
  sources/
    camera.js         CameraSource (getUserMedia + VideoTexture)
    demo.js           DemoSource (fuente sintética para ?demo)
  ar/
    air-draw.js       Controlador del modo «dibujo en el aire»
    hand-tracker.js   MediaPipe HandLandmarker: suavizado EMA + pellizco
    strokes.js        Lienzo 2D → CanvasTexture de trazos (undo/clear)
    camera-motion.js  Anclaje al mundo: flujo óptico (LK) + similitud RANSAC
  ui/
    overlay.js        Overlay de arranque / error y mapa de errores
    filter-bar.js     Barra táctil de filtros (autogenerada desde el registro)
    controls.js       Panel de opciones por filtro (campo `controls` del registro)
    fps.js            Contador de FPS (modo ?debug)
test/
  ar/                 Banco de pruebas del modo AR: cámara sintética con una
                     mano real y aserciones numéricas (abrir test/ar/)
```

## Cómo funciona (arquitectura)

```
getUserMedia (cámara trasera, 720p ideal)
        │
        ▼
<video playsinline muted autoplay>   ← nunca visible en el DOM
        │
        ▼
THREE.VideoTexture ──► ShaderMaterial sobre PlaneGeometry(2,2)
                        con OrthographicCamera(-1..1)  = quad a pantalla completa
        │
        ▼
GPU: Sobel 3x3 sobre luminancia + sombreado + grano (por filtro)
```

- **Sin deformación:** el UV se re-mapea en modo *cover* (`coverUv()`), así el
  video llena cualquier pantalla (vertical u horizontal) recortando el exceso
  en lugar de estirarse.
- **Rendimiento móvil:** `devicePixelRatio` limitado a 2.0, sin mipmaps
  (textura NPOT), sin antialias (innecesario en post-proceso), render pausado
  hasta que hay frames de video.
- **Limpieza:** al reintentar/finalizar se detienen los tracks del stream y se
  hace `dispose()` de texturas, materiales, geometría y renderer (`App.dispose`,
  `CameraSource.dispose`, evento `pagehide`).

## Ejecutar localmente

`getUserMedia` **solo funciona en contextos seguros** (`https://` o
`http://localhost`). Elige según dónde quieras probar:

### A. En el propio ordenador (localhost ya es "seguro")

```bash
cd casavacia
python3 -m http.server 8080
# abre http://localhost:8080 (usará la webcam del Mac)
```

### B. Teléfono en la misma red Wi-Fi — HTTPS con mkcert (recomendado)

```bash
brew install mkcert            # macOS (en Linux: apt install mkcert / descargar binario)
mkcert -install                # instala la CA local en el sistema

ipconfig getifaddr en0         # averigua tu IP local, p. ej. 192.168.1.42
mkcert 192.168.1.42            # genera 192.168.1.42.pem + 192.168.1.42-key.pem

npx serve -l 8443 \
  --ssl-cert ./192.168.1.42.pem \
  --ssl-key  ./192.168.1.42-key.pem .
# en el móvil (misma red): https://192.168.1.42:8443
```

### C. Teléfono fuera de la red — túnel con certificado válido

```bash
brew install cloudflared
python3 -m http.server 8080 &          # servidor local
cloudflared tunnel --url http://localhost:8080
# imprime una URL https://xxxx.trycloudflare.com → ábrela en el móvil
```

(Alternativa: `ngrok http 8080`.)

### D. Solo para desarrollo — flag de Chrome (sin HTTPS)

En Chrome Android escribe `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
añade `http://TU_IP:8080`, relanza el navegador. Úsalo solo en redes de prueba.

### Modos de depuración

| URL | Efecto |
|---|---|
| `?demo` | Fuente sintética animada **sin cámara** (ideal para ajustar shaders en el ordenador) |
| `?debug` | Muestra el contador de FPS |

Pueden combinarse: `http://localhost:8080/?demo&debug`.

## Parámetros del fragment shader (filtro Lápiz)

Los valores por defecto viven en `FILTERS.sketch.uniforms` dentro de
`js/filters.js`. Todos son float y admiten ajuste en caliente desde la
consola del navegador:

```js
// ejemplo: trazo más grueso y menos sensible
__app.materials.sketch.uniforms.uThickness.value = 2.2;      // grosor
__app.materials.sketch.uniforms.uEdgeThreshold.value = 0.10; // umbral
```

| Uniform | Rango típico | Qué controla |
|---|---|---|
| `uEdgeThreshold` | 0.05 – 0.35 | **Umbral de bordes**: gradientes menores no se dibujan. Subir = solo contornos fuertes. |
| `uEdgeSoftness` | 0.1 – 0.8 | Suavizado del umbral (antialias del trazo). Alto = presión variable, más orgánico. |
| `uThickness` | 1.0 – 2.5 | **Grosor de línea** (multiplicador del paso de muestreo en texels). |
| `uLineStrength` | 0 – 1 | **Contraste / opacidad** del trazo de grafito. |
| `uShading` | 0 – 1 | Intensidad del sombreado en zonas oscuras (0 = solo line art). |

El filtro Cómic añade `uBands` (nº de niveles, 3–8) y `uSaturation` (0 = B/N,
1 = color completo). Blueprint comparte los cuatro primeros.

### Filtros con panel de opciones: Matrix y Polígonos

Matrix y Polígonos exponen sus parámetros en un **panel de opciones** que
aparece sobre la barra de filtros al activarlos (toggles, sliders y color
picker). El panel se declara en el propio registro (`controls`) y escribe
directamente en los uniforms, así que también se pueden ajustar por consola:

- **Matrix** — densidad de la rejilla, velocidad de caída, largo de estela y
  cuánto se ve la imagen real debajo de la lluvia. La luminancia de la cámara
  alimenta el brillo de los glifos.
- **Polígonos** — malla irregular de triángulos planos en modo silueta
  (todo-o-nada por umbral de brillo): relleno sí/no (sin relleno quedan solo
  las aristas), color único o paleta de colores aleatorios que se
  intercambian entre polígonos, umbral y tamaño de celda.

## Modo AR «dibujo en el aire»

Con la cámara en marcha, la barra **Dibujar** (encima de la barra de filtros)
activa el tracking de mano con **MediaPipe HandLandmarker** sobre el mismo
`<video>` de la cámara (sin WebXR: funciona igual en iOS Safari y Android
Chrome). Un anillo sigue la punta del índice; al **pellizcar** (pulgar +
índice) el lápiz baja y dibuja trazos persistentes; al soltar, sube.
**Deshacer** elimina el último trazo y **Limpiar** borra todo.

- El trazo se compone **dentro del shader del filtro activo** (`applyInk()`
  en el prelude común): grafito en Lápiz, tinta blanca en Blueprint, verde
  fósforo en Matrix… Cambiar de filtro re-estiliza el dibujo al instante.
- Los trazos viven en un lienzo 2D transparente (`js/ar/strokes.js`) subido
  como `CanvasTexture` y muestreado por su canal alfa a través de los
  uniforms compartidos `uStrokes` + `uInkStrength`. Con el modo apagado y sin
  trazos, `uInkStrength = 0` y el render es idéntico al de antes.
- El cursor y el trazo coinciden con el dedo porque el mapeo
  landmark→pantalla (`air-draw.js`) replica en JS la matemática *cover* de
  `coverUv()` que recorta el vídeo en el shader.
- El toggle solo enciende/apaga el tracking: los trazos ya dibujados siguen
  visibles (y componiéndose con el filtro) hasta Deshacer/Limpiar.

### Anclaje al mundo real

Los trazos **se quedan pegados a la escena**, no a la pantalla: al mover el
móvil, el dibujo acompaña al mundo (`js/ar/camera-motion.js`). Cada frame de
vídeo se analiza con flujo óptico disperso (puntos con gradiente 2D seguidos
con Lucas-Kanade piramidal de **jsfeat**, cargado por CDN solo al activar el
modo) y se ajusta una transformación de similitud robusta (RANSAC) que se
acumula frame a frame; los trazos (guardados en coordenadas «mundo») se
re-proyectan con ella al dibujarse. El propio tracker consume una copia del
frame hecha con `drawImage`, garantizando que el espacio de los landmarks
coincide con el del render en todas las plataformas (iOS puede entregar
frames del sensor girados respecto a cómo se compositan).

Límites de esta estabilización 2D por imagen (sin SLAM ni sensores): giros
muy rápidos, superficies sin textura u oclusión de la lente degradan el
anclaje — si el flujo no es fiable, la transformación se congela y el trazo
se comporta como anclado a pantalla hasta recuperar tracking.

### Rendimiento y carga

- MediaPipe Tasks Vision y jsfeat se cargan por CDN con carga perezosa al
  activar el modo (fijados en el import map de `index.html` y
  `CONFIG.ar.jsfeatUrl`); el modelo (~7 MB) y el WASM solo se descargan
  entonces — la carga inicial del sitio queda intacta.
- El landmarker usa delegate **GPU con fallback CPU** y `numHands: 1`;
  solo se ejecuta `detectForVideo()` cuando el vídeo avanzó de frame.

### Parámetros (`CONFIG.ar` en `js/config.js`)

| Clave | Qué controla |
|---|---|
| `smoothAlpha` | Suavizado EMA de la punta del índice (0 rígido · 1 sin suavizar). |
| `tipExtend` | Compensación del curvado del índice al pellizcar: prolonga el punto de dibujo a lo largo del eje del dedo (fracción de la distancia nudillo→punta). |
| `pinchOn` / `pinchOff` | Histéresis del pellizco: distancia pulgar-índice normalizada por el tamaño de la mano (invariante a la profundidad). |
| `strokeWidth` | Grosor del trazo como fracción del lado corto del viewport. |
| `maxStrokeCanvas` | Tope de px del lienzo de trazos (lado largo). |
| `breakJump` | Salto que corta el trazo (pérdida/reaparición de la mano). |
| `wasmUrl` / `modelUrl` / `jsfeatUrl` | CDNs de MediaPipe y jsfeat (la versión de MediaPipe debe coincidir con el import map). |

### Límite conocido (v1)

El anclaje es una estabilización 2D por flujo óptico: escenas sin textura,
giros rápidos o tapar la lente lo degradan (se congela la última
transformación válida). Anclaje 3D real requeriría SLAM/odometría inercial.

## Banco de pruebas del modo AR (`test/ar/`)

Cámara sintética (canvas con una foto de mano real sobre fondo texturizado)
que ejecuta el pipeline de producción sin modificar y verifica numéricamente
que la tinta cae sobre la punta del índice y que los trazos siguen al mundo
al desplazar la escena. Útil como regresión tras tocar `js/ar/`:

```bash
python3 -m http.server 8080
# abrir http://localhost:8080/test/ar/ (viewport móvil recomendado)
# resultado en pantalla y en window.__result — align/anchor con errPx
```

## Añadir un filtro nuevo (arquitectura extensible)

1. Crea `js/shaders/sepia.js` exportando su `main()` en GLSL, reutilizando el
   prelude (`sobel()`, `coverUv()`, `luma()`, `hash21()` y los uniforms
   `uTexture/uTexel/uUvScale/uTime/uResolution`).
2. Añade una entrada al registro `FILTERS` (`js/filters.js`) con `label`,
   `icon` (SVG inline, en `js/icons.js`), `fragment` y sus `uniforms` propios.
   Opcionalmente añade `controls` para que el filtro tenga panel de opciones
   (`js/ui/controls.js`): `[{ key, kind: 'range'|'toggle'|'color', label,
   min, max, step }]`.
3. Nada más: la barra táctil, el panel de opciones, los materiales y la
   liberación de recursos se generan automáticamente desde el registro.

```js
// js/filters.js
sepia: {
  label: 'Sepia',
  icon: ICONS.sketch, // tu SVG
  fragment: FRAG_SEPIA,
  uniforms: {},
},
```

```glsl
// js/shaders/sepia.js
export const FRAG_SEPIA = /* glsl */`
  void main() {
    vec3 c = texture2D(uTexture, coverUv(vUv)).rgb;
    float l = luma(c);
    gl_FragColor = vec4(vec3(l) * vec3(1.1, 0.85, 0.6), 1.0);
  }
`;
```

## Notas de compatibilidad móvil

- **iOS Safari:** `playsinline` + `muted` permiten la reproducción automática
  sin gesto; el `<video>` permanece en el DOM a 1px (no `display:none`, que
  puede pausar el video en iOS). Requiere iOS ≥ 16.4 para ES modules + import
  maps sin polyfill.
- **Android Chrome:** si el stream llega rotado, `videoWidth/videoHeight` ya
  reflejan la rotación aplicada, así que el cálculo de aspecto sigue válido.
- **Permisos revocados:** el overlay de error indica cómo reactivarlos desde
  el candado de la barra de direcciones; el botón *Reintentar* reconstruye el
  stream liberando antes los recursos.
- **Si baja de 60 fps:** reduce `CONFIG.video` a `960×540` o
  `CONFIG.maxPixelRatio` a `1.5` (ambos en `js/config.js`).

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Marcado + import map de Three.js (0.185 vía CDN). Sin build. |
| `css/` | Estilos separados por capa: base, HUD y overlay. |
| `js/` | Aplicación modularizada en ES modules (ver estructura arriba). |
| `README.md` | Este documento. |

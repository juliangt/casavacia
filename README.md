# Filtros de dibujo en tiempo real (WebGL / Three.js)

SPA 100 % client-side que captura la cámara trasera del móvil y procesa el
video en GPU con shaders GLSL propios sobre Three.js.

**Filtros incluidos:** Boceto a lápiz (Sobel + sombreado de grafito),
Blueprint arquitectónico (cianotipo con rejilla), Cómic / cel-shading
(posterizado + tinta) y vista normal sin procesar.

---

## Estructura del proyecto

HTML, CSS y JS están separados, y el JS está modularizado con ES modules
(sin build ni bundler). Three.js se carga vía CDN con un *import map*
declarado en `index.html` (único sitio donde se fija la versión):

```
index.html            Solo marcado + import map + carga de js/main.js
css/
  base.css            Reset, documento, canvas WebGL y <video> oculto
  hud.css             Barra de filtros y chip de FPS
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
  sources/
    camera.js         CameraSource (getUserMedia + VideoTexture)
    demo.js           DemoSource (fuente sintética para ?demo)
  ui/
    overlay.js        Overlay de arranque / error y mapa de errores
    filter-bar.js     Barra táctil de filtros (autogenerada desde el registro)
    fps.js            Contador de FPS (modo ?debug)
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

## Añadir un filtro nuevo (arquitectura extensible)

1. Crea `js/shaders/sepia.js` exportando su `main()` en GLSL, reutilizando el
   prelude (`sobel()`, `coverUv()`, `luma()`, `hash21()` y los uniforms
   `uTexture/uTexel/uUvScale/uTime`).
2. Añade una entrada al registro `FILTERS` (`js/filters.js`) con `label`,
   `icon` (SVG inline, en `js/icons.js`), `fragment` y sus `uniforms` propios.
3. Nada más: la barra táctil, los materiales y la liberación de recursos se
   generan automáticamente desde el registro.

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

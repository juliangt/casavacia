# Plan: AR «Dibujo en el aire» con tracking de mano (MediaPipe)

> **Estado:** implementado (checklist en la sección 6); la prueba funcional
> completa con cámara real (sección 5.2) queda pendiente para dispositivo.
> **Fecha del plan:** 2026-09-07. **Implementación:** 2026-09-08.
> **Base:** app de filtros de dibujo en tiempo real (Three.js 0.185 por CDN, sin build
> system, módulos ES estáticos). Filtros existentes: normal, sketch, blueprint, comic,
> matrix y polygons, con panel de `controls` declarativo. Publicado en GitHub Pages.

---

## 1. Concepto

Nuevo modo AR activable desde la UI: **MediaPipe HandLandmarker** analiza el `<video>`
existente (cámara trasera, ya en marcha). Al **pellizcar** (pulgar + índice) se baja el
«lápiz» y la punta del dedo índice dibuja trazos persistentes en pantalla.

El trazo se compone **dentro del shader del filtro activo**: dibujas en el aire y el
trazo adquiere el estilo del filtro (grafito en Lápiz, tinta blanca en Blueprint, verde
fósforo en Matrix…). Los filtros siguen funcionando igual; el modo se activa/desactiva
con un toggle y los trazos se guardan hasta Limpiar/Deshacer.

### Por qué esta vía (decisión ya tomada)

- Se descartó **WebXR (`immersive-ar`)**: no funciona en iOS Safari y requeriría cambiar
  a cámara perspectiva + escena 3D real. Al publicarse en GitHub Pages (se abre desde
  móvil, incluido iPhone), MediaPipe por `<video>` es la vía universal (iOS + Android).
- Se descartó **AR facial** como primera funcionalidad (opción alternativa valorada);
  el dibujo en el aire es más coherente con la identidad de la app.
- MediaPipe Tasks Vision se carga por **CDN con `import()` perezoso**: respeta la
  filosofía sin-build del proyecto y no penaliza la carga inicial (el modelo ~7 MB se
  descarga solo al activar el modo).

## 2. Arquitectura

```
main.js ── createAirDraw() ──► js/ar/air-draw.js   (controlador del modo)
                                   ├─ js/ar/hand-tracker.js  (MediaPipe, suavizado, pinch)
                                   ├─ js/ar/strokes.js      (lienzo 2D + CanvasTexture, undo/clear)
                                   └─ App.shared.uStrokes + uInkStrength → FRAG_PRELUDE.applyInk()
```

Puntos de extensión existentes que aprovecha:

- `App.shared` (js/app.js): uniforms compartidos por referencia en todos los materiales
  → añadir `uStrokes`/`uInkStrength` ahí los propaga a todos los filtros de golpe
  (mismo mecanismo que `uTime`).
- `FRAG_PRELUDE` (js/shaders/common.js): helpers GLSL comunes → añadir `applyInk()`.
- La fuente de vídeo (`CameraSource`) no se toca: el tracker lee el mismo `<video>`.

## 3. Cambios archivo por archivo

### 3.1 `index.html`

- Import map: añadir
  `"@mediapipe/tasks-vision": "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<versión>"`
  (comprobar la última 0.10.x en jsdelivr al implementar; el WASM y el modelo `.task`
  se cargan desde los CDN de MediaPipe/Google Storage).
- Markup nuevo (oculto al inicio):
  - `#drawbar`: toolbar con toggle «Dibujar», «Deshacer» y «Limpiar».
  - `#cursor`: anillo que sigue la punta del dedo, cambia de estado al pellizcar.
  - `#draw-status`: chip tipo `#fps` para «Cargando tracking…» / errores.

### 3.2 `js/config.js`

Nuevo bloque `CONFIG.ar`:

- `smoothAlpha` — suavizado EMA de la punta del índice.
- `pinchOn` / `pinchOff` — histéresis de pellizco (distancia pulgar-índice normalizada
  por el tamaño de la mano → invariante a la profundidad).
- `strokeWidth` — grosor del trazo.
- `maxStrokeCanvas` — tope del lienzo de trazos (~1280 px lado largo).

### 3.3 `js/shaders/common.js` (`FRAG_PRELUDE`)

- Uniforms comunes nuevos: `uniform sampler2D uStrokes; uniform float uInkStrength;`
- Helper:

```glsl
vec3 applyInk(vec3 color, vec3 inkColor) {
  float a = texture2D(uStrokes, vUv).a * uInkStrength;
  return mix(color, inkColor, a);
}
```

- El quad cubre la pantalla y el lienzo de trazos es del tamaño del viewport → `vUv`
  alinea trazo y píxel sin matemáticas extra.

### 3.4 `js/shaders/{normal,sketch,blueprint,comic,matrix,polygons}.js`

- Una línea final por filtro: `gl_FragColor = vec4(applyInk(color, INK), 1.0);` con
  color de tinta propio del estilo:
  - sketch → grafito gris-azulado `vec3(0.16, 0.17, 0.19)`
  - blueprint → tinta blanca (anotación técnica)
  - comic → negro de tinta
  - matrix → verde fósforo (acorde al filtro)
  - normal / polygons → tinta oscura neutra
- Posible mejora futura: subir el color a uniform (`uInkColor`) y exponerlo en el
  panel `controls` con `kind: 'color'`.

### 3.5 `js/app.js`

- `this.shared` añade:
  - `uStrokes: { value: placeholder }` — DataTexture 1×1 transparente; sin modo AR,
    `.a = 0` en todas partes (nunca se muestrea una textura nula).
  - `uInkStrength: { value: 0 }`.
- Método `setStrokes(textureOrNull)`: enlaza la CanvasTexture de trazos (o el
  placeholder) y conmuta `uInkStrength` 1/0.
- `_tick`: invocar callback opcional `beforeRender(t)` después de `source.update()` y
  **antes** de `render()` — el `onFrame` existente se ejecuta tras el render; el
  tracking necesita ir antes para que trazo y cursor no vayan un frame retrasados.
- `dispose()`: liberar placeholder y textura de trazos.

### 3.6 NUEVO `js/ar/hand-tracker.js`

- `import()` dinámico de `@mediapipe/tasks-vision` solo al activar el modo.
- `HandLandmarker` en modo `VIDEO`, `numHands: 1`, delegate **GPU con fallback CPU**.
- `detectForVideo()` solo cuando `video.currentTime` avanzó desde la última detección
  (evita trabajo duplicado entre frames de cámara). Timestamps monótonos
  (`performance.now()`).
- Estado expuesto: mano detectada, landmarks (21 puntos), punta del índice
  (landmark 8) **suavizada con EMA**, y `pinching` con histéresis (distancia
  pulgar(4)-índice(8) normalizada por la distancia muñeca(0)→base del corazón(9)).
- `dispose()`: `landmarker.close()` para liberar WASM/GPU.

### 3.7 NUEVO `js/ar/strokes.js`

- Lienzo 2D offscreen **transparente** con trazos blancos: solo importa el canal alfa.
- `THREE.CanvasTexture` asociada.
- API: `begin(x,y)` / `extend(x,y)` / `end()` (segmentos con `lineCap/lineJoin:
  'round'`, grosor escalado), `undo()` (re-redibujo desde el array de trazos),
  `clear()`.
- Puntos guardados en **coords normalizadas de viewport** → re-redibujo correcto tras
  resize; `texture.needsUpdate` solo mientras se dibuja.
- Corte de trazo si la punta salta más de un umbral en un frame (pérdida/reaparición
  de la mano).

### 3.8 NUEVO `js/ar/air-draw.js`

- Controlador del modo: ciclo de vida del tracker, mapeo landmark→pantalla replicando
  en JS la matemática «cover» de `coverUv()` (los landmarks vienen en espacio del
  vídeo; el shader recorta con `uUvScale` → misma fórmula para que el cursor coincida
  con el dedo), transiciones de pellizco → begin/extend/end, y fin de trazo al perder
  la mano.
- Estados: carga (spinner en el botón + chip de estado), activo, error (mensaje en el
  chip, el toggle revierte; **no** usar `showError` para no tumbar la sesión).

### 3.9 `js/main.js`

- Instanciar el controlador tras arrancar la cámara; cablear `#drawbar`:
  - toggle con `aria-pressed` (mismo patrón que la barra de filtros),
  - Deshacer/Limpiar visibles solo cuando hay trazos,
  - pista inicial «Pellizca para dibujar» auto-ocultable.
- En `?demo` el tracking no tiene vídeo real: ocultar `#drawbar`.
- Pasar `beforeRender` al constructor de `App`.

### 3.10 `js/icons.js` + `css/hud.css`

- Iconos SVG inline (lápiz, deshacer, papelera) al estilo de los existentes.
- Estilos de `#drawbar` (misma estética glass de `#filters`, situada encima de la
  barra de filtros), `#cursor` (anillo con estado pinch, posicionado por `transform`),
  `#draw-status` (reutiliza el look de `#fps`).

### 3.11 `README.md`

Documentar el modo AR: cómo funciona, módulos nuevos (`js/ar/`), parámetros en
`CONFIG.ar`, nota de rendimiento (modelo cargado solo al activar; GPU delegate) y
y el anclaje de trazos al mundo por flujo óptico (añadido durante la
implementación; ver «Notas de la implementación»).

## 4. Decisiones de diseño (resumen)

1. Trazo compuesto dentro del shader de cada filtro (la identidad de la app), no como
   capa DOM encima.
2. Tracking con `import()` perezoso: la carga inicial del sitio queda intacta.
3. Una sola mano en v1; trazos persistentes hasta Limpiar/Deshacer; el toggle solo
   enciende/apaga el tracking.
4. Sin WebXR: funciona igual en iOS Safari y Android Chrome.
5. La cámara puede caer a frontal si no hay trasera: el vídeo no se espeja en la app
   hoy, así que el mapeo landmark→pantalla sigue siendo consistente sin casos extra.

## 5. Verificación

1. Servidor local (`python3 -m http.server`) + comprobación en navegador: carga sin
   errores de consola, botones presentes, `?debug` para FPS.
2. Prueba funcional del flujo completo en dispositivo/escritorio con cámara:
   activar → cargar modelo → el cursor sigue la mano → pellizcar dibuja →
   deshacer/limpiar → cambiar de filtro re-estiliza el trazo.
3. Regresión de filtros sin modo AR: con `uInkStrength = 0` el resultado debe ser
   idéntico bit a bit al actual.

## 6. Checklist de implementación

- [x] Comprobar última versión de `@mediapipe/tasks-vision` en jsdelivr y fijarla en el
      import map (`index.html`) — fijada la **1.0.1** (línea estable actual; la 0.10.x
      que se contemplaba al escribir el plan ya no es la última)
- [x] Markup: `#drawbar`, `#cursor`, `#draw-status` (`index.html`)
- [x] `CONFIG.ar` (`js/config.js`)
- [x] `FRAG_PRELUDE`: uniforms `uStrokes`/`uInkStrength` + `applyInk()`
      (`js/shaders/common.js`)
- [x] Línea `applyInk()` en los 6 filtros (`js/shaders/*.js`)
- [x] Uniforms compartidos + `setStrokes()` + `beforeRender` + dispose (`js/app.js`)
- [x] `js/ar/hand-tracker.js`
- [x] `js/ar/strokes.js`
- [x] `js/ar/air-draw.js`
- [x] Cableado UI + guard de `?demo` (`js/main.js`)
- [x] Iconos (`js/icons.js`) y estilos (`css/hud.css`)
- [x] README (`README.md`)
- [x] Verificación local (sección 5): carga sin errores y renderizado de los 5
      filtros en `?demo&debug`, regresión con `uInkStrength = 0` y disponibilidad de
      bundle/WASM/modelo en CDN verificada. La parte 5.2 (flujo con cámara real:
      activar → cursor → pellizcar → deshacer/limpiar) requiere dispositivo — el
      navegador de pruebas no entrega stream de cámara.

## 7. Extensiones futuras posibles

- Dos manos simultáneas (`numHands: 2`).
- Color de tinta configurable por filtro (uniform `uInkColor` + control `color`).
- Grosor de trazo modulado por la velocidad de la mano o la «presión» del pellizco.
- Exportar/capturar la composición (vídeo filtrado + trazos) como imagen.
- ~~Anclaje de trazos al mundo real~~ — **implementado** (ver nota abajo):
  estabilización 2D por flujo óptico. Anclaje 3D con SLAM queda como
  evolución posterior.

---

## 8. Notas de la implementación (2026-09-08)

Desviaciones y hallazgos respecto del plan original, surgidos de la validación
con el banco de pruebas sintético (`test/ar/`) y de las pruebas en dispositivo:

- **Tracking por copia del frame**: `detectForVideo` analiza un canvas al que
  el frame se copia con `drawImage` (no el `<video>` directo). Así el espacio
  de los landmarks coincide con el del render en todas las plataformas: iOS
  puede entregar frames del sensor girados respecto a cómo se texturizan, lo
  que desplazaba los trazos (incluso fuera de pantalla).
- **Anclaje al mundo** (`js/ar/camera-motion.js`, pedido durante la
  implementación): los trazos se guardan en coordenadas «mundo» y se
  re-proyectan cada frame con una similitud acumulada (RANSAC sobre flujo
  óptico LK). Validado numéricamente: error < 1 px con pan conocido.
- **Máscara de la mano en el flujo óptico**: la caja que rodea a la mano
  detectada se excluye de la estimación de movimiento — sin ella, al
  dibujar, los trazos «se pegaban» al movimiento de la MANO (que domina el
  encuadre) en vez de al mundo. Verificado con test de contaminación en
  `test/ar/` (±1 px con máscara vs error creciente sin ella).
- **Punta efectiva** (`CONFIG.ar.tipExtend`): el punto de dibujo se prolonga
  a lo largo del eje del dedo para compensar el curvado del índice al
  pellizcar; el pellizco se mide con los landmarks reales.
- **Cursor en píxeles CSS** (`innerWidth/innerHeight`), no `vw/vh`: en móvil
  `100vh` incluye la barra de direcciones y desplaza el anillo.
- **jsfeat 0.0.8 por CDN**: su `fast_corners` es defectuoso en ese build (no
  detecta esquinas reales) — la selección de puntos usa gradiente propio; y
  la pirámide debe construirse con `build(gray, false)` (con `true` el
  seguimiento LK queda a cero). Ambos verificados con desplazamiento conocido.
- La versión fijada de MediaPipe es la **1.0.1** (la 0.10.x contemporánea al
  plan ya no es la línea estable).

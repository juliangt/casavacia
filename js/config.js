/* ============================================================================
 * Configuración global y parámetros de URL
 * ========================================================================== */
export const CONFIG = Object.freeze({
  video: {
    facingMode: 'environment', // cámara trasera (ideal → no falla si no existe)
    width: 1280,               // 720p recomendado; subir a 1920 para 1080p
    height: 720,
    requestTimeoutMs: 10000,   // margen por si el dispositivo tarda en dar metadatos
  },
  maxPixelRatio: 2.0, // tope de devicePixelRatio (evita recalentamiento / jank)

  // Modo AR «dibujo en el aire» (ver js/ar/ y docs/plan-ar-dibujo-en-el-aire.md)
  ar: {
    smoothAlpha: 0.45,     // suavizado EMA de la punta del índice (0 rígido · 1 sin suavizar)
    tipExtend: 0.22,       // prolonga el punto de dibujo más allá de la punta a lo largo
                           // del eje del dedo (compensa el curvado del índice al pellizcar)
    pinchOn: 0.32,         // pellizco «abajo»: d(pulgar,índice)/d(muñeca,base corazón)
    pinchOff: 0.45,        // pellizco «arriba» (histéresis: siempre > pinchOn)
    strokeWidth: 0.014,    // grosor del trazo (fracción del lado corto del viewport)
    maxStrokeCanvas: 1280, // tope px del lienzo de trazos (lado largo)
    breakJump: 0.15,       // salto normalizado que corta el trazo (reaparición de la mano)
    // CDNs de MediaPipe (la librería y el modelo ~7 MB solo se descargan al
    // activar el modo; la versión se fija aquí y en el import map de index.html)
    wasmUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
    modelUrl: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    // jsfeat (flujo óptico del anclaje al mundo), también perezoso
    jsfeatUrl: 'https://cdn.jsdelivr.net/npm/jsfeat@0.0.8/build/jsfeat.min.js',
  },
});

export const PARAMS = new URLSearchParams(location.search);
export const DEBUG = PARAMS.has('debug'); // ?debug → muestra FPS
export const DEMO  = PARAMS.has('demo');  // ?demo  → fuente sintética, sin cámara

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
});

export const PARAMS = new URLSearchParams(location.search);
export const DEBUG = PARAMS.has('debug'); // ?debug → muestra FPS
export const DEMO  = PARAMS.has('demo');  // ?demo  → fuente sintética, sin cámara

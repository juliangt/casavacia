/* ============================================================================
 * AR — tracking de mano con MediaPipe HandLandmarker (modo «dibujo en el aire»)
 *
 * La librería (~7 MB con el modelo) se carga por CDN con import() perezoso
 * SOLO al activar el modo, así la carga inicial del sitio queda intacta.
 * Analiza el mismo <video> de la cámara; no toca CameraSource.
 *
 * Estado expuesto tras cada update():
 *   detected : hay mano en el frame
 *   tip      : punta del índice (landmark 8) suavizada con EMA,
 *              en coords normalizadas del vídeo (x→, y↓)
 *   pinching : pellizco pulgar+índice con histéresis, normalizado por el
 *              tamaño de la mano (invariante a la profundidad)
 * ========================================================================== */
import { CONFIG } from '../config.js';

const THUMB = 4, INDEX_PIP = 6, INDEX_TIP = 8, WRIST = 0, MIDDLE_BASE = 9;

export class HandTracker {
  constructor(video) {
    this.video = video;
    this.detected = false;
    this.pinching = false;
    this.pinchRatio = 0; // último ratio pulgar-índice (diagnóstico ?debug)
    this.landmarks = null;
    this.tip = { x: 0.5, y: 0.5 };
    this._landmarker = null;
    this._lastVideoTime = -1;
    this._ts = 0;
    this._hadHand = false;
  }

  /** Carga MediaPipe y crea el landmarker (delegate GPU con fallback CPU). */
  async start() {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(CONFIG.ar.wasmUrl);
    const options = delegate => ({
      baseOptions: { modelAssetPath: CONFIG.ar.modelUrl, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    });
    try {
      this._landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      // Sin WebGL2 / GPU no disponible para el grafo: la CPU es más lenta
      // pero suficiente para una mano.
      this._landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    }
  }

  /** Detecta sobre el frame nuevo del vídeo (los frames repetidos se saltan). */
  update() {
    if (!this._landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = this.video.currentTime;
    // detectForVideo exige timestamps estrictamente crecientes (ms).
    this._ts = Math.max(this._ts + 1, performance.now() | 0);

    let result;
    try {
      result = this._landmarker.detectForVideo(this.video, this._ts);
    } catch {
      return; // frame no consumible (p. ej. dimensiones aún a 0): esperar el siguiente
    }

    const hand = result?.landmarks?.[0];
    if (!hand) {
      this.detected = false;
      this.pinching = false;
      this.landmarks = null;
      this._hadHand = false;
      return;
    }

    this.detected = true;
    this.landmarks = hand;

    // Punta EFECTIVA: el landmark 8 cae donde la punta se curva al pellizcar
    // (por debajo de donde se apunta con el dedo), así que el punto de dibujo
    // se prolonga a lo largo del eje del dedo (nudillo 6 → punta 8) hasta la
    // "uña visual". El pellizco sí se mide con los landmarks reales.
    const raw = {
      x: hand[INDEX_TIP].x + (hand[INDEX_TIP].x - hand[INDEX_PIP].x) * CONFIG.ar.tipExtend,
      y: hand[INDEX_TIP].y + (hand[INDEX_TIP].y - hand[INDEX_PIP].y) * CONFIG.ar.tipExtend,
    };

    // EMA de la punta; se reinicia al reaparecer la mano para que el cursor
    // no "vuele" desde la última posición conocida.
    if (this._hadHand) {
      const a = CONFIG.ar.smoothAlpha;
      this.tip.x += (raw.x - this.tip.x) * a;
      this.tip.y += (raw.y - this.tip.y) * a;
    } else {
      this.tip.x = raw.x;
      this.tip.y = raw.y;
    }
    this._hadHand = true;

    // Pellizco con histéresis: la distancia pulgar-índice se normaliza por
    // el tamaño de la mano (muñeca → base del corazón) → invariante a la
    // profundidad a la que esté la mano respecto de la cámara.
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const ratio = dist(hand[THUMB], hand[INDEX_TIP])
                / Math.max(dist(hand[WRIST], hand[MIDDLE_BASE]), 1e-6);
    this.pinchRatio = ratio;
    if (!this.pinching && ratio < CONFIG.ar.pinchOn) this.pinching = true;
    else if (this.pinching && ratio > CONFIG.ar.pinchOff) this.pinching = false;
  }

  /** Libera el landmarker y su WASM/GPU. */
  dispose() {
    this._landmarker?.close();
    this._landmarker = null;
    this.detected = false;
    this.pinching = false;
  }
}

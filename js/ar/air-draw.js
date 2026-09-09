/* ============================================================================
 * AR — controlador del modo «dibujo en el aire»
 *
 * Ciclo de vida del tracker + lienzo de trazos, llamado desde App a través
 * de beforeRender (antes del render: trazo y cursor sin retardo de frame).
 *
 *   createAirDraw({ app, video, cursorEl, onState, onStrokes })
 *     onState('idle'|'loading'|'active'|'error', mensaje?)
 *     onStrokes(hayTrazos)   → visibilidad de Deshacer/Limpiar
 *
 * Estados: carga (modelo por CDN), activo y error (el chip informa y el
 * toggle revierte; NUNCA showError, que tumbaría la sesión de cámara).
 * El toggle solo enciende/apaga el tracking: los trazos ya dibujados siguen
 * componiéndose hasta Deshacer/Limpiar.
 * ========================================================================== */
import { HandTracker } from './hand-tracker.js';
import { StrokeCanvas } from './strokes.js';
import { CameraMotion, identity } from './camera-motion.js';
import { DEBUG } from '../config.js';

// Conexiones del esqueleto de la mano (índices de landmarks de MediaPipe)
// usadas solo por el overlay de diagnóstico de ?debug.
const HAND_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // pulgar
  [0, 5], [5, 6], [6, 7], [7, 8],         // índice
  [5, 9], [9, 10], [10, 11], [11, 12],    // corazón
  [9, 13], [13, 14], [14, 15], [15, 16],  // anular
  [13, 17], [17, 18], [18, 19], [19, 20], // meñique
  [0, 17],
];

export function createAirDraw({ app, video, cursorEl, onState = () => {}, onStrokes = () => {} }) {
  const strokes = new StrokeCanvas();
  let tracker = null;
  let motion = null;       // anclaje al mundo (null si jsfeat no carga)
  let lastFrameId = -1;    // sincroniza el flujo óptico con frames nuevos
  let active = false;
  let drawing = false;
  let inkBound = false; // ¿está la textura de trazos enlazada en App?

  /* --- overlay de diagnóstico (?debug) ------------------------------------ */

  const dbg = DEBUG ? createDebugOverlay() : null;

  function drawDebug() {
    if (!dbg) return;
    const { ctx, canvas } = dbg;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!tracker?.detected) {
      dbg.info(`sin mano · video ${video.videoWidth}×${video.videoHeight}`);
      return;
    }
    const pts = tracker.landmarks.map(mapToViewport);
    ctx.strokeStyle = ctx.fillStyle = 'rgba(90, 225, 130, .95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of HAND_EDGES) {
      ctx.moveTo(pts[a].x * canvas.width, pts[a].y * canvas.height);
      ctx.lineTo(pts[b].x * canvas.width, pts[b].y * canvas.height);
    }
    ctx.stroke();
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Punta efectiva de dibujo (con la compensación tipExtend): cruz amarilla.
    const t = mapToViewport(tracker.tip);
    const tx = t.x * canvas.width, ty = t.y * canvas.height;
    ctx.strokeStyle = '#ffd257';
    ctx.beginPath();
    ctx.moveTo(tx - 7, ty); ctx.lineTo(tx + 7, ty);
    ctx.moveTo(tx, ty - 7); ctx.lineTo(tx, ty + 7);
    ctx.stroke();
    const s = app.shared.uUvScale.value;
    dbg.info(`video ${video.videoWidth}×${video.videoHeight} · uvScale(${s.x.toFixed(2)}, ${s.y.toFixed(2)}) · pinch ${tracker.pinchRatio.toFixed(2)}${tracker.pinching ? ' ●' : ''}${motion ? ` · flow ${motion.confidence}/${motion.points}` : ''}`);
  }

  /* --- composición con el filtro activo ---------------------------------- */

  function bindInk() {
    if (!inkBound) {
      app.setStrokes(strokes.texture);
      inkBound = true;
    }
  }

  function syncInk() {
    if (inkBound && !strokes.hasInk) {
      app.setStrokes(null); // sin trazos: placeholder + uInkStrength = 0
      inkBound = false;
    }
    onStrokes(strokes.hasInk);
  }

  /* --- ciclo de vida del modo -------------------------------------------- */

  async function enable() {
    if (active) return;
    onState('loading');
    tracker = new HandTracker(video);
    motion = new CameraMotion();
    try {
      await Promise.all([
        tracker.start(),
        // El anclaje es opcional: sin flujo óptico se dibuja en pantalla.
        motion.start().catch(err => {
          console.warn('[ar] anclaje al mundo desactivado:', err);
          motion = null;
        }),
      ]);
    } catch (err) {
      console.warn('[ar] no se pudo iniciar el tracking:', err);
      tracker.dispose();
      tracker = null;
      motion = null;
      onState('error', 'No se pudo cargar el seguimiento de mano. Revisa la conexión e inténtalo de nuevo.');
      return;
    }
    lastFrameId = -1;
    active = true;
    onState('active');
  }

  function disable() {
    if (tracker) {
      tracker.dispose();
      tracker = null;
    }
    active = false;
    endStroke();
    cursorEl?.classList.remove('visible', 'pinching');
    if (dbg) dbg.ctx.clearRect(0, 0, dbg.canvas.width, dbg.canvas.height);
    onState('idle');
  }

  function endStroke() {
    if (drawing) {
      strokes.end();
      drawing = false;
      syncInk();
    }
  }

  /* --- per-frame (beforeRender) ------------------------------------------- */

  function update() {
    if (!active || !tracker) return;
    tracker.update();

    // Anclaje: estimar el movimiento de cámara de cada frame NUEVO y
    // re-proyectar los trazos con la transformación acumulada.
    if (motion && tracker.frameId !== lastFrameId) {
      lastFrameId = tracker.frameId;
      motion.update(tracker.frameCanvas);
    }
    strokes.setCamera(app.shared.uUvScale.value, motion ? motion.transform : identity());

    if (DEBUG) drawDebug();

    if (!tracker.detected) {
      endStroke(); // fin de trazo al perder la mano
      cursorEl?.classList.remove('visible');
      return;
    }

    const p = mapToViewport(tracker.tip);
    if (cursorEl) {
      // Píxeles CSS reales (innerWidth/innerHeight, igual que el canvas WebGL):
      // las unidades vw/vh quedan desplazadas en móvil, donde 100vh incluye la
      // barra de direcciones y no coincide con el área visible.
      cursorEl.style.transform = `translate(${(p.x * innerWidth).toFixed(1)}px, ${(p.y * innerHeight).toFixed(1)}px)`;
      cursorEl.classList.add('visible');
      cursorEl.classList.toggle('pinching', tracker.pinching);
    }

    if (tracker.pinching) {
      // La tinta se guarda en coords MUNDO (espacio del vídeo): así el
      // movimiento de cámara posterior la re-proyecta anclada a la escena.
      const w = strokes.fromScreen(p.x, p.y);
      if (!drawing) {
        strokes.begin(w);
        drawing = true;
        bindInk();
        onStrokes(true);
      } else {
        strokes.extend(w);
      }
    } else {
      endStroke();
    }
  }

  /**
   * Landmark (espacio de vídeo, y↓) → viewport normalizado (y↓), replicando
   * en JS la inversión de la matemática «cover» de coverUv(): el shader
   * muestrea el vídeo en (uv - 0.5) * uUvScale + 0.5, así que el punto del
   * vídeo (u, v) [v hacia arriba, textura] se ve en pantalla en
   * ((u, v) - 0.5) / uUvScale + 0.5. Así el cursor coincide con el dedo.
   */
  function mapToViewport(tip) {
    const s = app.shared.uUvScale.value;
    const u = (tip.x - 0.5) / Math.max(s.x, 1e-4) + 0.5;
    const v = ((1 - tip.y) - 0.5) / Math.max(s.y, 1e-4) + 0.5; // landmark y↓ → textura v↑
    return { x: u, y: 1 - v };
  }

  /* --- acciones de UI ------------------------------------------------------ */

  function undo() {
    endStroke();
    strokes.undo();
    syncInk();
  }

  function clear() {
    endStroke();
    strokes.clear();
    syncInk();
  }

  function dispose() {
    disable();
    strokes.dispose();
    if (inkBound) {
      app.setStrokes(null);
      inkBound = false;
    }
  }

  return {
    enable, disable, update, undo, clear, dispose,
    strokes, mapToViewport,
    get active() { return active; },
    get tracker() { return tracker; },
    get motion() { return motion; },
  };
}

/* Canvas fijo sobre el vídeo (solo ?debug): esqueleto de la mano con la
   MISMA transformación que la tinta + línea de estado con datos de
   diagnóstico (dimensiones del vídeo, uvScale y ratio de pellizco). */
function createDebugOverlay() {
  const canvas = document.createElement('canvas');
  canvas.id = 'ar-debug';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '3',
  });
  const fit = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  addEventListener('resize', fit);
  fit();
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  return {
    canvas, ctx,
    info(text) {
      ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'top';
      const pad = 4, x = 8, y = 8;
      const w = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(10, 10, 12, .65)';
      ctx.fillRect(x - pad, y - pad, w + 2 * pad, 12 + 2 * pad);
      ctx.fillStyle = '#9fe8b1';
      ctx.fillText(text, x, y);
    },
  };
}

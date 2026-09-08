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

export function createAirDraw({ app, video, cursorEl, onState = () => {}, onStrokes = () => {} }) {
  const strokes = new StrokeCanvas();
  let tracker = null;
  let active = false;
  let drawing = false;
  let inkBound = false; // ¿está la textura de trazos enlazada en App?

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
    try {
      await tracker.start();
    } catch (err) {
      console.warn('[ar] no se pudo iniciar el tracking:', err);
      tracker.dispose();
      tracker = null;
      onState('error', 'No se pudo cargar el seguimiento de mano. Revisa la conexión e inténtalo de nuevo.');
      return;
    }
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

    if (!tracker.detected) {
      endStroke(); // fin de trazo al perder la mano
      cursorEl?.classList.remove('visible');
      return;
    }

    const p = mapToViewport(tracker.tip);
    if (cursorEl) {
      cursorEl.style.transform = `translate(${(p.x * 100).toFixed(2)}vw, ${(p.y * 100).toFixed(2)}vh)`;
      cursorEl.classList.add('visible');
      cursorEl.classList.toggle('pinching', tracker.pinching);
    }

    if (tracker.pinching) {
      if (!drawing) {
        strokes.begin(p.x, p.y);
        drawing = true;
        bindInk();
        onStrokes(true);
      } else {
        strokes.extend(p.x, p.y);
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
    const u = (tip.x - 0.5) / s.x + 0.5;
    const v = ((1 - tip.y) - 0.5) / s.y + 0.5; // landmark y↓ → textura v↑
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
    get active() { return active; },
  };
}

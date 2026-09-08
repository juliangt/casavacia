/* ============================================================================
 * UI — contador de FPS (modo ?debug)
 *   frame(t) se llama una vez por frame renderizado; el texto se refresca
 *   cada 500 ms para que la lectura sea estable.
 * ========================================================================== */
export function createFpsMeter(el) {
  let t0 = performance.now();
  let frames = 0;
  return {
    frame(t) {
      frames++;
      if (t - t0 >= 500) {
        el.textContent = `${Math.round(frames * 1000 / (t - t0))} fps`;
        t0 = t;
        frames = 0;
      }
    },
  };
}

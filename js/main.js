/* ============================================================================
 * PUNTO DE ENTRADA — conecta motor (App), fuentes de video y UI.
 * ========================================================================== */
import * as THREE from 'three';
import { DEBUG, DEMO } from './config.js';
import { App } from './app.js';
import { CameraSource } from './sources/camera.js';
import { DemoSource } from './sources/demo.js';
import { setOverlay, hideOverlay, showError, onOverlayAction } from './ui/overlay.js';
import { buildFilterBar } from './ui/filter-bar.js';
import { renderControls } from './ui/controls.js';
import { createFpsMeter } from './ui/fps.js';
import { createAirDraw } from './ar/air-draw.js';
import { DEFAULT_FILTER } from './filters.js';
import { ICONS } from './icons.js';

const $ = id => document.getElementById(id);
const canvasEl = $('gl');
const fpsEl = $('fps');
const filtersEl = $('filters');
const controlsEl = $('controls');
const videoEl = $('cam');
const drawbarEl = $('drawbar');
const drawToggleEl = $('draw-toggle');
const drawUndoEl = $('draw-undo');
const drawClearEl = $('draw-clear');
const drawStatusEl = $('draw-status');
const cursorEl = $('cursor');

/* --- Modo AR «dibujo en el aire» ---------------------------------------- */
let airDraw = null;
let statusTimer = 0;

function setStatus(text, { sticky = false } = {}) {
  clearTimeout(statusTimer);
  drawStatusEl.textContent = text;
  drawStatusEl.classList.toggle('hidden', !text);
  if (text && !sticky) statusTimer = setTimeout(() => drawStatusEl.classList.add('hidden'), 4000);
}

function ensureAirDraw() {
  if (airDraw) return airDraw;
  airDraw = createAirDraw({
    app,
    video: videoEl,
    cursorEl,
    onState(state, message) {
      drawToggleEl.setAttribute('aria-pressed', String(state === 'active'));
      drawToggleEl.classList.toggle('loading', state === 'loading');
      if (state === 'loading') setStatus('Cargando tracking…', { sticky: true });
      else if (state === 'active') setStatus('Pellizca para dibujar');
      else if (state === 'error') setStatus(message, { sticky: true });
      else setStatus(''); // idle
    },
    onStrokes(hasInk) {
      drawUndoEl.classList.toggle('hidden', !hasInk);
      drawClearEl.classList.toggle('hidden', !hasInk);
      if (hasInk) setStatus(''); // ya dibujó: la pista sobra
    },
  });
  return airDraw;
}

drawToggleEl.innerHTML = ICONS.draw + '<span>Dibujar</span>';
drawUndoEl.innerHTML = ICONS.undo + '<span>Deshacer</span>';
drawUndoEl.setAttribute('aria-label', 'Deshacer el último trazo');
drawClearEl.innerHTML = ICONS.trash + '<span>Limpiar</span>';
drawClearEl.setAttribute('aria-label', 'Limpiar todos los trazos');

drawToggleEl.addEventListener('click', () => {
  const d = ensureAirDraw();
  if (d.active) d.disable();
  else d.enable();
  navigator.vibrate?.(8);
});
drawUndoEl.addEventListener('click', () => { airDraw?.undo(); navigator.vibrate?.(8); });
drawClearEl.addEventListener('click', () => { airDraw?.clear(); navigator.vibrate?.(8); });

const fpsMeter = DEBUG ? createFpsMeter(fpsEl) : null;
const app = new App(canvasEl, {
  onFrame: t => fpsMeter?.frame(t),
  beforeRender: () => airDraw?.update(), // tracking antes del render (sin retardo)
});

/* --- Flujo de cámara -------------------------------------------------- */
async function startCameraFlow() {
  setOverlay({
    icon: '<div class="spinner" role="status"></div>',
    title: 'Solicitando cámara…',
    text: 'Si el navegador pide permiso, elige «Permitir».',
  });
  try {
    const source = new CameraSource(videoEl, () => showError({ name: 'TrackEnded' }));
    await source.start();
    app.setSource(source);
    hideOverlay();
    filtersEl.classList.remove('hidden');
    drawbarEl.classList.remove('hidden'); // el modo AR necesita vídeo real
  } catch (err) {
    // Asegura que no queden tracks/streams abiertos tras un fallo parcial.
    videoEl.srcObject?.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
    showError(err);
  }
}

async function restartCameraFlow() {
  app.source?.dispose();      // libera stream + textura antes de reintentar
  app.setSource(null);
  await startCameraFlow();
}

onOverlayAction(() => (app.source ? restartCameraFlow() : startCameraFlow()));

// Pérdida de contexto WebGL (móvil con memoria justa): avisar en vez de congelar.
canvasEl.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  showError({ name: 'WebGLLost', message: 'Se perdió el contexto gráfico. Recarga la página.' });
});

// Al ocultar la página se libera la cámara (LED apagado, privacidad, batería).
addEventListener('pagehide', () => {
  airDraw?.dispose(); // tracker MediaPipe (WASM/GPU) + lienzo de trazos
  app.source?.dispose();
}, { once: true });

/* --- Arranque --------------------------------------------------------- */
buildFilterBar(filtersEl, id => {
  app.setFilter(id);
  renderControls(controlsEl, app, id);
});
renderControls(controlsEl, app, DEFAULT_FILTER);
app.start();

// Handle de depuración: permite ajustar uniforms en caliente desde la consola,
// p. ej. __app.materials.sketch.uniforms.uThickness.value = 2.0
window.__app = app;
window.__THREE = THREE;

if (DEBUG || DEMO) {
  fpsEl.textContent = DEMO ? 'DEMO' : '-- fps';
  fpsEl.classList.remove('hidden');
}

if (DEMO) {
  app.setSource(new DemoSource());
  hideOverlay();
  filtersEl.classList.remove('hidden');
}

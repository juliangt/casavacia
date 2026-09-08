/* ============================================================================
 * UI — overlay de arranque / error
 *   setOverlay(...)  → pinta el estado (icono, título, texto, botón, hint)
 *   hideOverlay()    → lo oculta cuando la cámara ya está en marcha
 *   showError(err)   → mapea errores de getUserMedia a texto para humanos
 *   onOverlayAction(cb) → click en el botón (Iniciar / Reintentar)
 * ========================================================================== */
import { ICON_ALERT } from '../icons.js';

const $ = id => document.getElementById(id);
const overlayEl = $('overlay'), iconEl = $('ov-icon'), titleEl = $('ov-title'),
      textEl = $('ov-text'), btnEl = $('ov-btn'), hintEl = $('ov-hint');

export function setOverlay({ icon, title, text, btn, hint, err = false }) {
  iconEl.innerHTML = icon;
  iconEl.classList.toggle('err', err);
  titleEl.textContent = title;
  textEl.textContent = text;
  hintEl.classList.toggle('hidden', !hint);
  btnEl.classList.toggle('hidden', !btn);
  if (btn) btnEl.textContent = btn;
  overlayEl.classList.remove('hidden');
}

export function hideOverlay() {
  overlayEl.classList.add('hidden');
}

export function onOverlayAction(cb) {
  btnEl.addEventListener('click', () => cb());
}

function describeCameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return ['Permiso denegado', 'Concede acceso a la cámara desde el icono de la barra de direcciones y pulsa Reintentar.'];
    case 'NotFoundError':
    case 'OverconstrainedError':
      return ['Cámara no disponible', 'No se encontró ninguna cámara compatible en este dispositivo.'];
    case 'NotReadableError':
    case 'AbortError':
      return ['Cámara ocupada', 'Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo.'];
    case 'InsecureContext':
      return ['Se necesita HTTPS', 'La cámara solo está disponible en contextos seguros: sirve la página por https:// o ábrela en http://localhost.'];
    case 'TrackEnded':
      return ['La cámara se detuvo', 'El flujo de video terminó inesperadamente. Puedes reiniciarlo.'];
    case 'TimeoutError':
      return ['Sin respuesta de la cámara', 'El dispositivo tardó demasiado en entregar video.'];
    default:
      return ['No se pudo iniciar', err?.message || 'Error desconocido al acceder a la cámara.'];
  }
}

export function showError(err) {
  const [title, text] = describeCameraError(err);
  setOverlay({ icon: ICON_ALERT, title, text, btn: 'Reintentar', err: true });
}

/* ============================================================================
 * UI — barra táctil de filtros
 *   Se genera automáticamente desde el registro FILTERS; al pulsar un botón
 *   se notifica a través de onSelect(id) y se actualiza el estado aria-pressed.
 * ========================================================================== */
import { FILTERS, DEFAULT_FILTER } from '../filters.js';

export function buildFilterBar(container, onSelect) {
  for (const [id, f] of Object.entries(FILTERS)) {
    const b = document.createElement('button');
    b.innerHTML = f.icon + `<span>${f.label}</span>`;
    b.setAttribute('aria-pressed', String(id === DEFAULT_FILTER));
    b.addEventListener('click', () => {
      onSelect(id);
      for (const btn of container.children) btn.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      navigator.vibrate?.(8); // feedback táctil (Android)
    });
    container.appendChild(b);
  }
}

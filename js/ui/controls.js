/* ============================================================================
 * UI — panel de opciones del filtro activo
 *   Se genera desde el campo opcional `controls` del registro FILTERS:
 *   [{ key, kind: 'range'|'toggle'|'color', label, min?, max?, step? }]
 *   Escribe directamente en los uniforms del material del filtro activo.
 *   Los filtros sin `controls` (los históricos) simplemente ocultan el panel.
 * ========================================================================== */
import { FILTERS } from '../filters.js';

export function renderControls(container, app, filterId) {
  container.textContent = '';
  const controls = FILTERS[filterId]?.controls;
  if (!controls?.length) {
    container.classList.add('hidden');
    return;
  }
  const uniforms = app.materials[filterId].uniforms;
  for (const c of controls) container.appendChild(buildControl(c, uniforms));
  container.classList.remove('hidden');
}

function buildControl(c, uniforms) {
  const row = document.createElement('label');
  row.className = `ctl ctl-${c.kind}`;
  const name = document.createElement('span');
  name.textContent = c.label;
  const input = document.createElement('input');
  const u = uniforms[c.key];

  if (c.kind === 'toggle') {
    input.type = 'checkbox';
    input.checked = u.value > 0.5;
    input.addEventListener('change', () => { u.value = input.checked ? 1 : 0; });
    row.append(input, name);
  } else if (c.kind === 'color') {
    input.type = 'color';
    input.value = '#' + u.value.getHexString();
    input.addEventListener('input', () => u.value.set(input.value));
    row.append(name, input);
  } else { // range
    input.type = 'range';
    input.min = c.min;
    input.max = c.max;
    input.step = c.step;
    input.value = u.value;
    const readout = document.createElement('span');
    readout.className = 'ctl-value';
    readout.textContent = formatValue(u.value, c.step);
    input.addEventListener('input', () => {
      u.value = parseFloat(input.value);
      readout.textContent = formatValue(u.value, c.step);
    });
    row.append(name, input, readout);
  }
  return row;
}

function formatValue(v, step) {
  return step >= 1 ? String(Math.round(v)) : v.toFixed(2);
}

/* ============================================================================
 * REGISTRO DE FILTROS (arquitectura extensible)
 *    Para añadir un filtro nuevo basta añadir una entrada aquí: id, etiqueta,
 *    icono, uniforms propios y el fragment shader (main). El prelude común
 *    (uniforms de video, coverUv, sobel, hash21...) ya está disponible.
 *
 *    Cada entrada puede llevar además `controls`: una lista declarativa de
 *    opciones visibles en el panel de UI (js/ui/controls.js) que escriben
 *    directo en los uniforms del material:
 *      { key, kind: 'range'|'toggle'|'color', label, min?, max?, step? }
 * ========================================================================== */
import { FRAG_NORMAL } from './shaders/normal.js';
import { FRAG_SKETCH } from './shaders/sketch.js';
import { FRAG_BLUEPRINT } from './shaders/blueprint.js';
import { FRAG_COMIC } from './shaders/comic.js';
import { FRAG_MATRIX, MATRIX_UNIFORMS } from './shaders/matrix.js';
import { FRAG_POLYGONS, POLYGON_UNIFORMS } from './shaders/polygons.js';
import { ICONS } from './icons.js';

export const FILTERS = {
  normal: {
    label: 'Sin filtro',
    icon: ICONS.normal,
    fragment: FRAG_NORMAL,
    uniforms: {},
  },
  sketch: {
    label: 'Lápiz',
    icon: ICONS.sketch,
    fragment: FRAG_SKETCH,
    uniforms: {
      uEdgeThreshold: { value: 0.18 }, // umbral de bordes (0.05–0.35)
      uEdgeSoftness:  { value: 0.55 }, // suavizado del umbral
      uThickness:     { value: 1.5 },  // grosor de línea (× texel)
      uLineStrength:  { value: 1.0 },  // contraste del trazo
      uShading:       { value: 0.55 }, // intensidad del sombreado
    },
  },
  blueprint: {
    label: 'Blueprint',
    icon: ICONS.blueprint,
    fragment: FRAG_BLUEPRINT,
    uniforms: {
      uEdgeThreshold: { value: 0.22 },
      uEdgeSoftness:  { value: 0.45 },
      uThickness:     { value: 1.3 },
      uLineStrength:  { value: 1.0 },
    },
  },
  comic: {
    label: 'Cómic',
    icon: ICONS.comic,
    fragment: FRAG_COMIC,
    uniforms: {
      uEdgeThreshold: { value: 0.28 },
      uEdgeSoftness:  { value: 0.40 },
      uThickness:     { value: 1.2 },
      uLineStrength:  { value: 1.0 },
      uBands:         { value: 5.0 },  // niveles de cel-shading
      uSaturation:    { value: 0.85 }, // color conservado
    },
  },
  matrix: {
    label: 'Matrix',
    icon: ICONS.matrix,
    fragment: FRAG_MATRIX,
    uniforms: { ...MATRIX_UNIFORMS },
    controls: [
      { key: 'uRows',  kind: 'range', label: 'Densidad',  min: 20, max: 90, step: 1 },
      { key: 'uSpeed', kind: 'range', label: 'Velocidad', min: 0.2, max: 3, step: 0.1 },
      { key: 'uTrail', kind: 'range', label: 'Estela',    min: 4, max: 30, step: 1 },
      { key: 'uGhost', kind: 'range', label: 'Imagen de fondo', min: 0, max: 0.5, step: 0.01 },
    ],
  },
  // Filtro «Polígonos» OCULTO por ahora a petición del autor (el código,
  // shader y uniforms siguen en js/shaders/polygons.js): para volver a
  // mostrarlo, descomenta la entrada siguiente.
  /*
  polygons: {
    label: 'Polígonos',
    icon: ICONS.polygons,
    fragment: FRAG_POLYGONS,
    uniforms: { ...POLYGON_UNIFORMS },
    controls: [
      { key: 'uFill',         kind: 'toggle', label: 'Relleno' },
      { key: 'uRandomColors', kind: 'toggle', label: 'Colores random' },
      { key: 'uColor',        kind: 'color',  label: 'Color' },
      { key: 'uSwapSpeed',    kind: 'range',  label: 'Cambio de color', min: 0, max: 4, step: 0.1 },
      { key: 'uThreshold',    kind: 'range',  label: 'Umbral',  min: 0.05, max: 0.95, step: 0.01 },
      { key: 'uCells',        kind: 'range',  label: 'Tamaño',  min: 14, max: 70, step: 1 },
    ],
  },
  */
};

export const DEFAULT_FILTER = 'sketch';

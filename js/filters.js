/* ============================================================================
 * REGISTRO DE FILTROS (arquitectura extensible)
 *    Para añadir un filtro nuevo basta añadir una entrada aquí: id, etiqueta,
 *    icono, uniforms propios y el fragment shader (main). El prelude común
 *    (uniforms de video, coverUv, sobel, hash21...) ya está disponible.
 * ========================================================================== */
import { FRAG_NORMAL } from './shaders/normal.js';
import { FRAG_SKETCH } from './shaders/sketch.js';
import { FRAG_BLUEPRINT } from './shaders/blueprint.js';
import { FRAG_COMIC } from './shaders/comic.js';
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
};

export const DEFAULT_FILTER = 'sketch';

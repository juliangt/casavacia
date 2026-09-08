/* ----------------------------------------------------------------------------
 * FILTRO: Boceto a lápiz (filtro principal)
 * Estrategia:
 *   1. Contornos  → Sobel + umbral suavizado = trazos oscuros.
 *   2. Sombreado  → luminancia invertida con smoothstep = capas de grafito
 *                   en las zonas oscuras de la escena.
 *   3. Papel      → blanco cálido con grano procedural; el grano también
 *                   "rompe" el trazo para emular el diente del papel.
 *
 * Parámetros ajustables (valores por defecto en FILTERS.sketch.uniforms):
 *   uEdgeThreshold : UMBRAL DE BORDES. Gradientes menores no se dibujan.
 *                    0.05 = hiperlápiz (líneas por todas partes) ···· 0.35 =
 *                    solo contornos fuertes. Rango útil: 0.05 – 0.35.
 *   uEdgeSoftness  : anchura de la transición del umbral (antialias del trazo).
 *                    0 = línea dura tipo tinta; 0.4+ = trazo con presión
 *                    variable, más orgánico.
 *   uThickness     : GROSOR DE LÍNEA (multiplicador de texel).
 *                    1.0 = 1px del video; 1.5–2.5 = trazo grueso suelto.
 *   uLineStrength  : CONTRASTE / opacidad del trazo. 0 = sin líneas, 1 = negro
 *                    máximo.
 *   uShading       : intensidad del sombreado de grafito en sombras.
 *                    0 = solo contorno (estilo "line art"); 1 = manchas muy
 *                    cargadas.
 * -------------------------------------------------------------------------- */
export const FRAG_SKETCH = /* glsl */`
  uniform float uEdgeThreshold;
  uniform float uEdgeSoftness;
  uniform float uThickness;
  uniform float uLineStrength;
  uniform float uShading;

  void main() {
    vec2 uv = coverUv(vUv);

    // --- 1) Contornos -------------------------------------------------------
    float g = sobel(uv, uThickness);
    float line = smoothstep(uEdgeThreshold, uEdgeThreshold + uEdgeSoftness, g);
    line *= uLineStrength;

    // --- 2) Sombreado de grafito -------------------------------------------
    // smoothstep(0.18, 0.87, lum): 0 en luces → 1 en sombras profundas.
    float lum   = sampleLum(uv);
    float shade = (1.0 - smoothstep(0.18, 0.87, lum)) * uShading;

    // --- 3) Papel y mina de grafito ----------------------------------------
    vec2  px    = uv / uTexel;                       // coordenada en píxeles de video
    float grain = mix(hash21(px), hash21(px + 37.7), 0.5);
    vec3  paper = vec3(0.965, 0.955, 0.925) - (grain - 0.5) * 0.055;
    vec3  mine  = vec3(0.16, 0.17, 0.19);            // grafito gris-azulado

    // El grano modula la densidad de la tinta (diente del papel).
    float ink = clamp(line + shade, 0.0, 1.0);
    ink *= 0.82 + 0.36 * grain;

    gl_FragColor = vec4(mix(paper, mine, clamp(ink, 0.0, 1.0)), 1.0);
  }
`;

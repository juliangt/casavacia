/* ----------------------------------------------------------------------------
 * FILTRO: Cómic / cel-shading
 * Posteriza la luminancia en bandas planas (preservando el color) y añade un
 * contorno de tinta negro.
 *   uBands      : nº de niveles de sombreado (3 = muy plano, 8 = suave).
 *   uSaturation : color original conservado (0 = B/N, 1 = todo el color).
 * -------------------------------------------------------------------------- */
export const FRAG_COMIC = /* glsl */`
  uniform float uEdgeThreshold;
  uniform float uEdgeSoftness;
  uniform float uThickness;
  uniform float uLineStrength;
  uniform float uBands;
  uniform float uSaturation;

  void main() {
    vec2 uv = coverUv(vUv);
    vec3 c  = texture2D(uTexture, uv).rgb;

    // --- Bandas planas (cel shading) ----------------------------------------
    float lum = luma(c);
    float q   = floor(lum * uBands + 0.5) / uBands;
    // Reconstruye el color con la luminancia cuantizada preservando el tono.
    vec3 toon = clamp(c * (q / max(lum, 1e-4)), 0.0, 1.0);
    toon = mix(vec3(q * 0.9 + 0.05), toon, uSaturation);

    // --- Contorno de tinta ---------------------------------------------------
    float g = sobel(uv, uThickness);
    float line = smoothstep(uEdgeThreshold, uEdgeThreshold + uEdgeSoftness, g) * uLineStrength;

    gl_FragColor = vec4(mix(toon, vec3(0.06, 0.06, 0.08), line), 1.0);
  }
`;

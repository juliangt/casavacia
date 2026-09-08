/* ----------------------------------------------------------------------------
 * FILTRO: Blueprint arquitectónico (cianotipo)
 * Líneas blancas sobre papel azul + rejilla técnica tenue + relleno difuso
 * modulado por la luminancia de la escena.
 * Parámetros: mismo significado que en el filtro Lápiz.
 * -------------------------------------------------------------------------- */
export const FRAG_BLUEPRINT = /* glsl */`
  uniform float uEdgeThreshold;
  uniform float uEdgeSoftness;
  uniform float uThickness;
  uniform float uLineStrength;

  void main() {
    vec2 uv = coverUv(vUv);

    float g = sobel(uv, uThickness);
    float line = pow(smoothstep(uEdgeThreshold, uEdgeThreshold + uEdgeSoftness, g), 1.15);
    line *= uLineStrength;

    // Relleno difuso: la escena se "adivina" en azules más claros.
    float lum = sampleLum(uv);

    // Rejilla técnica en espacio de píxeles del video (celdas de 48 texels).
    vec2  cell = abs(fract(uv / uTexel / 48.0) - 0.5);
    float grid = (1.0 - smoothstep(0.0, 0.045, min(cell.x, cell.y))) * 0.10;

    vec3 bg  = mix(vec3(0.043, 0.145, 0.345), vec3(0.10, 0.24, 0.48), lum * 0.55);
    vec3 ink = vec3(0.92, 0.97, 1.0);

    vec3 col = bg + grid * (0.6 + 0.4 * lum);
    gl_FragColor = vec4(mix(col, ink, line), 1.0);
  }
`;

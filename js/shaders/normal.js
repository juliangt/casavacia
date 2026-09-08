/* ----------------------------------------------------------------------------
 * FILTRO: Vista normal (sin procesar) — solo corrección de aspecto.
 * -------------------------------------------------------------------------- */
export const FRAG_NORMAL = /* glsl */`
  void main() {
    gl_FragColor = vec4(texture2D(uTexture, coverUv(vUv)).rgb, 1.0);
  }
`;

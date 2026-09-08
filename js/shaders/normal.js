/* ----------------------------------------------------------------------------
 * FILTRO: Vista normal (sin procesar) — solo corrección de aspecto.
 * -------------------------------------------------------------------------- */
export const FRAG_NORMAL = /* glsl */`
  void main() {
    vec3 color = texture2D(uTexture, coverUv(vUv)).rgb;
    // Trazos AR con tinta oscura neutra (este filtro no tiene estilo propio).
    gl_FragColor = vec4(applyInk(color, vec3(0.10, 0.10, 0.12)), 1.0);
  }
`;

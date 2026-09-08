/* ============================================================================
 * Shaders GLSL comunes a todos los filtros
 * ========================================================================== */

// Vertex común: el quad PlaneGeometry(2,2) cubre exactamente el NDC (-1..1),
// por lo que con la cámara ortográfica ocupa toda la pantalla sin transformaciones.
export const VERTEX_SHADER = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Prelude compartido por todos los filtros (uniforms comunes + helpers GLSL).
export const FRAG_PRELUDE = /* glsl */`
  // --------------------------------------------------------------------------
  // Uniforms comunes
  //   uTexture    : textura de video (THREE.VideoTexture)
  //   uTexel      : tamaño de un texel en coordenadas UV (1/ancho, 1/alto)
  //   uUvScale    : corrección de aspecto tipo "cover" (ver coverUv)
  //   uResolution : tamaño del framebuffer en px físicos (= gl_FragCoord)
  // --------------------------------------------------------------------------
  uniform sampler2D uTexture;
  uniform vec2  uTexel;
  uniform vec2  uUvScale;
  uniform float uTime;
  uniform vec2  uResolution;
  varying vec2 vUv;

  // Re-mapea el UV del quad recortando el exceso de video (modo "cover"):
  // la imagen llena la pantalla SIN deformarse, recortando el lado sobrante
  // cuando el aspecto del video difiere del del canvas (móvil vertical, etc.).
  vec2 coverUv(vec2 uv) {
    return (uv - 0.5) * uUvScale + 0.5;
  }

  // Luminancia BT.601 — suficiente para procesamiento artístico.
  // (OJO: no llamar "luminance" a esta función: colisiona con un símbolo del
  // prefijo GLSL que inyecta Three.js/ANGLE y el programa falla al enlazar.)
  float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  float sampleLum(vec2 uv) {
    return luma(texture2D(uTexture, uv).rgb);
  }

  // --------------------------------------------------------------------------
  // Detección de bordes: operador de Sobel 3x3 sobre la luminancia.
  //   thickness : multiplica el paso de muestreo (uTexel).
  //               > 1.0 → líneas más GROSORAS y menos ruido de alta frecuencia.
  //               < 1.0 → líneas finas pero sensibles al ruido del sensor.
  // Devuelve la magnitud del gradiente: ~0 en zonas planas, hasta ~4.0 en
  // bordes duros (transición negro↔blanco).
  // --------------------------------------------------------------------------
  float sobel(vec2 uv, float thickness) {
    vec2 o = uTexel * thickness;
    float tl = sampleLum(uv + vec2(-o.x,  o.y));
    float tc = sampleLum(uv + vec2( 0.0,  o.y));
    float tr = sampleLum(uv + vec2( o.x,  o.y));
    float ml = sampleLum(uv + vec2(-o.x,  0.0));
    float mr = sampleLum(uv + vec2( o.x,  0.0));
    float bl = sampleLum(uv + vec2(-o.x, -o.y));
    float bc = sampleLum(uv + vec2( 0.0, -o.y));
    float br = sampleLum(uv + vec2( o.x, -o.y));
    float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
    float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
    return length(vec2(gx, gy));
  }

  // Ruido blanco determinista barato (grano de papel / grafito).
  float hash21(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p.yx + 19.19);
    return fract((p.x + p.y) * p.x);
  }
`;

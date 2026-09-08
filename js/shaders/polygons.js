/* ============================================================================
 * Filtro «Polígonos» — la imagen se convierte en una malla irregular de
 * triángulos planos (silueta todo-o-nada por umbral de brillo).
 *
 * Single-pass: cada celda de una rejilla se parte en 2 triángulos con las
 * esquinas desplazadas por jitter determinista (hash por esquina → malla
 * continua entre celdas vecinas). El fragmento resuelve su triángulo con
 * coordenadas baricéntricas y muestrea la imagen en el centroide: como el
 * centroide es igual para todo el triángulo, el color resulta plano gratis.
 *
 * Opciones: relleno sí/no (sin relleno quedan solo las aristas), color único
 * o paleta aleatoria cuyos colores se intercambian entre polígonos con el
 * tiempo.
 * ========================================================================== */
import * as THREE from 'three';

const PALETTE = ['#ff5d5d', '#ffb84d', '#f8e71c', '#4dd166', '#4dc3ff', '#b06bff'];

export const POLYGON_UNIFORMS = {
  uCells:        { value: 34 },   // filas de polígonos en pantalla
  uThreshold:    { value: 0.45 }, // umbral de luminancia de la silueta
  uFill:         { value: 1.0 },  // 1 = polígonos rellenos · 0 = solo aristas
  uColor:        { value: new THREE.Color('#f2b23c') }, // color único
  uRandomColors: { value: 0.0 },  // 1 = paleta aleatoria intercambiándose
  uSwapSpeed:    { value: 1.2 },  // intercambios de color por segundo
  uPalette:      { value: PALETTE.map(c => new THREE.Color(c)) },
};

export const FRAG_POLYGONS = /* glsl */`
  uniform float uCells;
  uniform float uThreshold;
  uniform float uFill;
  uniform vec3  uColor;
  uniform float uRandomColors;
  uniform float uSwapSpeed;
  uniform vec3  uPalette[6];

  // Esquina de rejilla desplazada con jitter determinista: celdas vecinas
  // comparten esquina (mismo id) → la malla es continua.
  vec2 jitteredCorner(vec2 id) {
    return id + (vec2(hash21(id), hash21(id + 41.7)) - 0.5) * 0.66;
  }

  // Coordenadas baricéntricas de p en el triángulo (a, b, c).
  vec3 bary(vec2 p, vec2 a, vec2 b, vec2 c) {
    vec2 v0 = b - a, v1 = c - a, v2 = p - a;
    float d00 = dot(v0, v0), d01 = dot(v0, v1), d11 = dot(v1, v1);
    float d20 = dot(v2, v0), d21 = dot(v2, v1);
    float den = d00 * d11 - d01 * d01;
    float v = (d11 * d20 - d01 * d21) / den;
    float w = (d00 * d21 - d01 * d20) / den;
    return vec3(1.0 - v - w, v, w);
  }

  void main() {
    // Rejilla en px del framebuffer → unidades de celda.
    float cell = uResolution.y / uCells;
    vec2 g  = gl_FragCoord.xy / cell;
    vec2 id = floor(g);

    // Las 4 esquinas jittereadas de la celda; la diagonal se elige por celda
    // para romper la regularidad de la malla.
    vec2 a = jitteredCorner(id);
    vec2 b = jitteredCorner(id + vec2(1.0, 0.0));
    vec2 c = jitteredCorner(id + vec2(0.0, 1.0));
    vec2 d = jitteredCorner(id + vec2(1.0, 1.0));
    bool diagAD = hash21(id + 7.3) < 0.5;

    vec2 A0, A1, A2, B0, B1, B2;
    if (diagAD) { A0 = a; A1 = b; A2 = d;  B0 = a; B1 = d; B2 = c; }
    else        { A0 = a; A1 = b; A2 = c;  B0 = b; B1 = d; B2 = c; }

    // El fragmento pertenece al triángulo cuyas 3 componentes son ≥ 0
    // (en la diagonal compartida ambos valen 0: da igual cuál se elija).
    vec3 w0 = bary(g, A0, A1, A2);
    vec3 w1 = bary(g, B0, B1, B2);
    float m0 = min(w0.x, min(w0.y, w0.z));
    float m1 = min(w1.x, min(w1.y, w1.z));
    bool inA = m0 >= m1;
    vec3 w  = inA ? w0 : w1;
    vec2 T0 = inA ? A0 : B0;
    vec2 T1 = inA ? A1 : B1;
    vec2 T2 = inA ? A2 : B2;

    // Luminancia del triángulo: muestreo del centroide (común a todo el
    // triángulo → color plano) con 3 tomas para calmar el ruido del sensor.
    vec2 cuv = coverUv((T0 + T1 + T2) * (cell / 3.0) / uResolution);
    float lum = (sampleLum(cuv)
              + sampleLum(cuv + uTexel * 2.0)
              + sampleLum(cuv - uTexel * 2.0)) / 3.0;
    float on = step(uThreshold, lum);

    // Color del polígono: único o de la paleta intercambiándose con el tiempo.
    vec3 poly = uColor;
    if (uRandomColors > 0.5) {
      float tri = inA ? 0.0 : 1.0;
      float key = hash21(vec2(hash21(id) + tri * 0.5, floor(uTime * uSwapSpeed)));
      float k = key * 6.0;
      poly = uPalette[0];
      if (k > 1.0) poly = uPalette[1];
      if (k > 2.0) poly = uPalette[2];
      if (k > 3.0) poly = uPalette[3];
      if (k > 4.0) poly = uPalette[4];
      if (k > 5.0) poly = uPalette[5];
    }

    // Arista antialiasada: la componente baricéntrica mínima cerca de 0.
    float e = min(w.x, min(w.y, w.z));
    float edge = 1.0 - smoothstep(0.02, 0.06, e);

    vec3 bg = vec3(0.02, 0.025, 0.03);
    vec3 col;
    if (uFill > 0.5) {
      // Silueta plana: relleno todo-o-nada por polígono.
      col = mix(bg, poly, on);
    } else {
      // Solo aristas: brillantes donde la silueta pasa, tenues en el resto.
      vec3 line = poly * mix(0.15, 1.0, on);
      col = mix(bg, line, edge);
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

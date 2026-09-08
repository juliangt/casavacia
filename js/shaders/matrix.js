/* ============================================================================
 * Filtro «Matrix» — lluvia de caracteres verdes alimentada por la cámara.
 *
 * Cada columna de la rejilla tiene una "gota" que cae con velocidad y desfase
 * pseudoaleatorios; la luminancia de la cámara modula el brillo de la estela
 * (la escena "alimenta" la lluvia). Los glifos vienen de un atlas 16×8 pintado
 * una vez con canvas 2D (katakana + dígitos + símbolos).
 * ========================================================================== */
import * as THREE from 'three';

/* --- Atlas de glifos (canvas 2D → CanvasTexture) ----------------------- */
function buildGlyphAtlas() {
  const COLS = 16, ROWS = 8, CELL = 16; // 256×128 px · 128 huecos
  const cv = document.createElement('canvas');
  cv.width = COLS * CELL;
  cv.height = ROWS * CELL;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const glyphs = [];
  for (let i = 0; i < 80; i++) glyphs.push(String.fromCharCode(0x30a1 + i)); // katakana
  glyphs.push(...'0123456789', ...':<>=+*#%$&');

  glyphs.forEach((ch, i) => {
    ctx.fillText(ch, (i % COLS + 0.5) * CELL, (Math.floor(i / COLS) + 0.5) * CELL);
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter; // sin mipmaps (textura pequeña y NPOT-safe)
  tex.generateMipmaps = false;
  return tex;
}

export const MATRIX_UNIFORMS = {
  uGlyphs: { value: buildGlyphAtlas() },
  uRows:   { value: 42 },  // filas de celdas en pantalla (densidad)
  uSpeed:  { value: 1.0 }, // multiplicador global de velocidad de caída
  uTrail:  { value: 14 },  // largo de la estela (en filas)
  uGhost:  { value: 0.0 }, // imagen tenue bajo los glifos (0 = solo caracteres)
};

export const FRAG_MATRIX = /* glsl */`
  uniform sampler2D uGlyphs;
  uniform float uRows;
  uniform float uSpeed;
  uniform float uTrail;
  uniform float uGhost;

  const vec2 ATLAS = vec2(16.0, 8.0); // 128 huecos de glifo

  void main() {
    // Rejilla de celdas cuadradas en px del framebuffer.
    float cell = uResolution.y / uRows;
    vec2 g  = gl_FragCoord.xy / cell;
    vec2 id = floor(g);   // celda (columna, fila)
    vec2 f  = fract(g);   // posición dentro de la celda

    // La imagen se muestrea POR CELDA (en su centro): cada glifo adopta la
    // luminancia de su propia celda de imagen, así los caracteres FORMAN la
    // imagen en vez de flotar por encima (efecto ASCII/matrix).
    vec2 cellUv = coverUv((id + 0.5) * cell / uResolution);
    float clum = sampleLum(cellUv);
    float img = smoothstep(0.04, 0.62, clum);

    // Fondo: solo el fantasma opcional (por defecto apagado).
    vec3 col = texture2D(uTexture, cellUv).rgb * uGhost * 0.5;

    // Una gota por columna: velocidad y desfase estables por hash de columna.
    float speed = mix(5.0, 16.0, hash21(vec2(id.x, 1.0))) * uSpeed;
    float phase = hash21(vec2(id.x, 2.0));
    float span  = uRows + uTrail;
    // La cabeza cae de arriba abajo (gl_FragCoord.y crece hacia arriba).
    float head = span - mod(phase * span + uTime * speed, span);

    // Estela: 1 en la cabeza → 0 al final de la cola; solo por debajo de esta.
    // (smoothstep con bordes ascendentes: edge0 > edge1 es UB en GLSL.)
    float d = head - id.y;
    float trail = (d >= 0.0) ? 1.0 - smoothstep(0.0, uTrail, d) : 0.0;
    float headGlow = clamp(1.0 - d * 0.5, 0.0, 1.0); // blanquea la cabeza

    // Glifo pseudoaleatorio que muta varias veces por segundo.
    // (índice lineal 0..127 → hueco (columna, fila) del atlas 16×8)
    float gid = hash21(vec2(id.x, id.y * 7.31 + floor(uTime * 6.0)));
    float gi = gid * (ATLAS.x * ATLAS.y);
    vec2 slot = vec2(mod(gi, ATLAS.x), floor(gi / ATLAS.x));
    float glyph = texture2D(uGlyphs, (slot + f) / ATLAS).a;

    // La imagen la forman los glifos; la lluvia la recorre y la realza:
    // la estela aviva las celdas luminosas y blanquea la cabeza al pasar.
    float rain = trail * img;
    float intensity = max(img * 0.55, rain);
    vec3 green = mix(vec3(0.05, 0.55, 0.12), vec3(0.72, 1.0, 0.80), headGlow * trail * img);
    col += green * glyph * intensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

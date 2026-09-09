/* ============================================================================
 * AR — anclaje de trazos al mundo real
 *
 * Estima el movimiento de la CÁMARA entre frames con flujo óptico disperso
 * (puntos con gradiente 2D seguidos con Lucas-Kanade piramidal de jsfeat,
 * cargado por CDN solo al activar el modo) y ajusta una transformación de
 * SIMILITUD (escala + rotación + traslación, robusta con RANSAC). La
 * transformación acumulada mapa coordenadas «mundo» (uv del frame de vídeo
 * de anclaje) → uv del frame actual, y los trazos se re-proyectan con ella
 * en cada frame: al mover el móvil, el dibujo se queda pegado a la escena.
 *
 * Notas de implementación:
 * - El fast_corners del build 0.0.8 de jsfeat (CDN) es defectuoso (no
 *   detecta esquinas reales), así que los puntos se eligen con un gradiente
 *   propio: máximos con contraste en AMBAS direcciones + distancia mínima.
 * - La pirámide se construye con build(gray, false): con true aplica un
 *   tratamiento de bordes que deja el seguimiento en 0 (verificado
 *   empíricamente con desplazamiento conocido).
 *
 * Límites: estabilización 2D por imagen (sin SLAM/inercial): giros muy
 * rápidos, superficies sin textura u oclusión de la lente degradan el
 * anclaje (se congela la última transformación válida).
 * ========================================================================== */
import { CONFIG } from '../config.js';

const FLOW_W = 320;        // ancho de análisis (px); alto proporcional
const MAX_POINTS = 120;    // puntos seguidos por frame
const MIN_GRAD = 15;       // gradiente mínimo por dirección (punto «2D»)
const MIN_DIST = 8;        // distancia mínima entre puntos (px)
const MIN_INLIERS = 12;    // menos que esto = sin movimiento fiable
const RANSAC_ITERS = 24;
const INLIER_PX = 2.5;     // residuo máximo de un inlier (px del análisis)
const MAX_JUMP = 0.2;      // salto individual descartable (fracción del frame)

/* --- afinidades 2×3: {a,b,c,d,tx,ty} · (x,y) -------------------------- */

export const identity = () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

/** m ∘ n (aplica primero n, después m). */
export function mul(m, n) {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    tx: m.a * n.tx + m.c * n.ty + m.tx,
    ty: m.b * n.tx + m.d * n.ty + m.ty,
  };
}

export function invert(m) {
  const det = m.a * m.d - m.b * m.c;
  if (!det || !isFinite(det)) return identity();
  return {
    a: m.d / det, b: -m.b / det,
    c: -m.c / det, d: m.a / det,
    tx: (m.c * m.ty - m.d * m.tx) / det,
    ty: (m.b * m.tx - m.a * m.ty) / det,
  };
}

/** Similitud exacta a partir de 2 pares punto→punto (px). null si degenera. */
function simFrom2(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  const dpx = p2x - p1x, dpy = p2y - p1y;
  const dqx = q2x - q1x, dqy = q2y - q1y;
  const den = dpx * dpx + dpy * dpy;
  if (den < 256) return null; // pares casi coincidentes
  // a como complejo: q ≈ a·p + b  →  a = Δq/Δp
  const a_r = (dqx * dpx + dqy * dpy) / den;
  const a_i = (dqy * dpx - dqx * dpy) / den;
  return {
    a: a_r, b: a_i, c: -a_i, d: a_r,
    tx: q1x - (a_r * p1x - a_i * p1y),
    ty: q1y - (a_i * p1x + a_r * p1y),
  };
}

/** Mínimos cuadrados de similitud sobre los inliers (Procrustes 2D). */
function refine(pairs) {
  let px = 0, py = 0, qx = 0, qy = 0;
  for (let i = 0; i < pairs.length; i += 4) { px += pairs[i]; py += pairs[i + 1]; qx += pairs[i + 2]; qy += pairs[i + 3]; }
  const n = pairs.length / 4;
  px /= n; py /= n; qx /= n; qy /= n;
  let nr = 0, ni = 0, den = 0;
  for (let i = 0; i < pairs.length; i += 4) {
    const dx = pairs[i] - px, dy = pairs[i + 1] - py;
    const ex = pairs[i + 2] - qx, ey = pairs[i + 3] - qy;
    nr += dx * ex + dy * ey;
    ni += dx * ey - dy * ex;
    den += dx * dx + dy * dy;
  }
  if (den < 1e-6) return null;
  const a_r = nr / den, a_i = ni / den;
  return {
    a: a_r, b: a_i, c: -a_i, d: a_r,
    tx: qx - (a_r * px - a_i * py),
    ty: qy - (a_i * px + a_r * py),
  };
}

/** RANSAC de similitud sobre pares (px, aplanados p1x,p1y,q1x,q1y,…). */
function estimate(pairs) {
  const n = pairs.length / 4;
  if (n < MIN_INLIERS * 2) return null;
  let best = null, bestCount = 0;
  for (let k = 0; k < RANSAC_ITERS; k++) {
    const i = (Math.random() * n) | 0;
    let j = (Math.random() * n) | 0;
    if (i === j) continue;
    const m = simFrom2(
      pairs[i * 4], pairs[i * 4 + 1], pairs[i * 4 + 2], pairs[i * 4 + 3],
      pairs[j * 4], pairs[j * 4 + 1], pairs[j * 4 + 2], pairs[j * 4 + 3],
    );
    if (!m) continue;
    let count = 0;
    for (let t = 0; t < n; t++) {
      const ex = m.a * pairs[t * 4] + m.c * pairs[t * 4 + 1] + m.tx - pairs[t * 4 + 2];
      const ey = m.b * pairs[t * 4] + m.d * pairs[t * 4 + 1] + m.ty - pairs[t * 4 + 3];
      if (ex * ex + ey * ey < INLIER_PX * INLIER_PX) count++;
    }
    if (count > bestCount) { bestCount = count; best = m; }
  }
  if (!best || bestCount < MIN_INLIERS) return null;
  const inlierPairs = [];
  for (let t = 0; t < n; t++) {
    const ex = best.a * pairs[t * 4] + best.c * pairs[t * 4 + 1] + best.tx - pairs[t * 4 + 2];
    const ey = best.b * pairs[t * 4] + best.d * pairs[t * 4 + 1] + best.ty - pairs[t * 4 + 3];
    if (ex * ex + ey * ey < INLIER_PX * INLIER_PX) inlierPairs.push(pairs[t * 4], pairs[t * 4 + 1], pairs[t * 4 + 2], pairs[t * 4 + 3]);
  }
  const m = refine(inlierPairs) || best;
  return { m, inliers: inlierPairs.length / 4 };
}

/**
 * Puntos «seguibles»: gradiente en AMBAS direcciones (estructura 2D, no
 * bordes con problema de apertura) + supresión por distancia mínima.
 */
function pickPoints(gray, w, h) {
  const g = gray.data;
  const cand = [];
  for (let y = 6; y < h - 6; y++) {
    for (let x = 6; x < w - 6; x++) {
      const i = y * w + x;
      const gx = Math.abs(g[i + 1] - g[i - 1]);
      if (gx < MIN_GRAD) continue;
      const gy = Math.abs(g[i + w] - g[i - w]);
      if (gy < MIN_GRAD) continue;
      cand.push([gx + gy, x, y]);
    }
  }
  cand.sort((a, b) => b[0] - a[0]);
  const pts = [];
  const minD2 = MIN_DIST * MIN_DIST;
  for (const [, x, y] of cand) {
    let ok = true;
    for (const p of pts) {
      const dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < minD2) { ok = false; break; }
    }
    if (ok) {
      pts.push({ x, y });
      if (pts.length >= MAX_POINTS) break;
    }
  }
  return pts;
}

export class CameraMotion {
  constructor() {
    this.transform = identity(); // acumulada: mundo → frame actual (uv del vídeo)
    this.confidence = 0;         // inliers del último frame (0 = sin estimación)
    this.points = 0;             // puntos seguidos del último frame (diagnóstico)
    this._jsfeat = null;
    this._cv = document.createElement('canvas');
    this._ctx = this._cv.getContext('2d', { willReadFrequently: true });
    this._prev = null; // { pyr, xy(Float32Array), count, w, h }
  }

  /** Carga jsfeat (script clásico por CDN, perezoso). */
  async start() {
    if (this._jsfeat) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = CONFIG.ar.jsfeatUrl;
      s.onload = res;
      s.onerror = () => rej(new Error('No se pudo cargar jsfeat (flujo óptico).'));
      document.head.appendChild(s);
    });
    this._jsfeat = globalThis.jsfeat;
  }

  /** Prepara un frame: escala, gris, pirámide y puntos con gradiente 2D. */
  _prepare(frame) {
    const jf = this._jsfeat;
    const w = FLOW_W, h = Math.max(2, Math.round(FLOW_W * frame.height / frame.width));
    if (this._cv.width !== w || this._cv.height !== h) {
      this._cv.width = w; this._cv.height = h;
      this._prev = null;
    }
    this._ctx.drawImage(frame, 0, 0, w, h);
    const img = this._ctx.getImageData(0, 0, w, h);
    const gray = new jf.matrix_t(w, h, jf.U8_t | jf.C1_t);
    // grayscale consume los bytes RGBA crudos (imageData.data)
    jf.imgproc.grayscale(img.data, w, h, gray);
    const pyr = new jf.pyramid_t(3);
    pyr.allocate(w, h, jf.U8_t | jf.C1_t);
    pyr.build(gray, false); // OJO: con true el tracking no funciona (bordes)
    const pts = pickPoints(gray, w, h);
    this.points = pts.length;
    const xy = new Float32Array(pts.length * 2);
    pts.forEach((p, i) => { xy[i * 2] = p.x; xy[i * 2 + 1] = p.y; });
    return { pyr, xy, count: pts.length, w, h };
  }

  /** Acumula el movimiento entre el frame anterior y `frame` (canvas del
   *  tracker). `maskBox` ({x0,y0,x1,y1} en uv del frame) excluye una región
   *  del encuadre — la mano detectada — para que su movimiento no
   *  contamine la estimación del movimiento de CÁMARA. */
  update(frame, maskBox = null) {
    const jf = this._jsfeat;
    if (!jf || !frame || !frame.width || !frame.height) return this.transform;

    const cur = this._prepare(frame);
    const prev = this._prev;
    this._prev = cur; // el frame actual siempre pasa a ser el previo

    if (prev && prev.count >= MIN_INLIERS * 2 && cur.count >= MIN_INLIERS * 2) {
      const count = Math.min(prev.count, cur.count);
      const curXY = new Float32Array(count * 2);
      const status = new Uint8Array(count);
      jf.optical_flow_lk.track(prev.pyr, cur.pyr, prev.xy, curXY, count, 21, 30, status, 0.01, 1e-4);

      const pairs = [];
      for (let i = 0; i < count; i++) {
        if (!status[i]) continue;
        const px = prev.xy[i * 2], py = prev.xy[i * 2 + 1];
        const qx = curXY[i * 2], qy = curXY[i * 2 + 1];
        if (Math.abs(qx - px) > prev.w * MAX_JUMP || Math.abs(qy - py) > prev.h * MAX_JUMP) continue;
        // Puntos dentro de la caja enmascarada (la mano) no dicen nada del
        // movimiento de la cámara: se descartan.
        if (maskBox) {
          const nx = px / prev.w, ny = py / prev.h;
          if (nx > maskBox.x0 && nx < maskBox.x1 && ny > maskBox.y0 && ny < maskBox.y1) continue;
        }
        pairs.push(px, py, qx, qy);
      }

      const est = estimate(pairs);
      this.confidence = est ? est.inliers : 0;
      if (est) {
        const m = est.m;
        const scale = Math.hypot(m.a, m.b);
        const rot = Math.abs(Math.atan2(m.b, m.a));
        const bigJump = Math.abs(m.tx) > prev.w * MAX_JUMP || Math.abs(m.ty) > prev.h * MAX_JUMP;
        if (scale > 0.85 && scale < 1.18 && rot < 0.15 && !bigJump) {
          // px de análisis → uv normalizados del vídeo (conjugación diagonal)
          const d = mul(
            { a: 1 / cur.w, b: 0, c: 0, d: 1 / cur.h, tx: 0, ty: 0 },
            mul(m, { a: cur.w, b: 0, c: 0, d: cur.h, tx: 0, ty: 0 }),
          );
          this.transform = mul(d, this.transform);
        }
      }
    } else {
      this.confidence = 0;
    }
    return this.transform;
  }
}

/* ============================================================================
 * AR — lienzo de trazos del modo «dibujo en el aire»
 *
 * Canvas 2D offscreen TRANSPARENTE con trazos blancos: los shaders solo
 * muestrean su canal alfa (applyInk), así que el color de tinta lo pone el
 * filtro activo. La THREE.CanvasTexture asociada se sube a GPU solo cuando
 * cambia el lienzo.
 *
 * Los puntos se guardan en coordenadas MUNDO: el espacio uv del frame de
 * vídeo en el momento de dibujar (ver camera-motion.js). Al mover la cámara,
 * air-draw actualiza la proyección (setCamera) y el lienzo se re-dibuja con
 * la transformación acumulada → los trazos quedan anclados a la escena, no
 * a la pantalla. Sin cámara en marcha la proyección es la identidad de
 * cubrimiento «cover» y el comportamiento es el clásico de pantalla.
 * ========================================================================== */
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mul, invert, identity } from './camera-motion.js';

export class StrokeCanvas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.strokes = [];   // [{ points: [{x, y}] }] en coords mundo (uv vídeo, y↓)
    this._current = null;
    this._cover = { x: 1, y: 1 };   // uUvScale (recorte cover vídeo→pantalla)
    this._motion = identity();      // acumulada mundo→frame actual
    this._proj = null;              // última proyección renderizada (zona muerta)
    this._onResize = () => this._resize();
    addEventListener('resize', this._onResize);
    this._resize();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter; // NPOT: sin mipmaps (móvil)
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  get hasInk() {
    return this.strokes.length > 0;
  }

  /** Proyección completa mundo → píxeles del lienzo (cover ∘ movimiento). */
  _fullTransform() {
    const W = this.width, H = this.height;
    const S = this._cover, M = this._motion;
    const cover = { a: S.x, b: 0, c: 0, d: S.y, tx: 0.5 - 0.5 * S.x, ty: 0.5 - 0.5 * S.y };
    return mul(mul({ a: W, b: 0, c: 0, d: H, tx: 0, ty: 0 }, cover), M);
  }

  /** air-draw lo llama por frame con el recorte cover y la transformación
   *  de movimiento acumulada; re-proyecta los trazos si hay tinta. La
   *  zona muerta evita re-renderizados (y subidas a GPU) por jitter
   *  sub-píxel del flujo óptico. */
  setCamera(cover, motion, force = false) {
    this._cover = cover;
    this._motion = motion;
    this._updateLineWidth();
    if (!this.hasInk) return;
    if (!force && this._sameProjection(cover, motion)) return;
    this._proj = { cover: { ...cover }, motion: { ...motion } };
    this._redraw();
  }

  _sameProjection(cover, motion) {
    const p = this._proj;
    if (!p) return false;
    const W = this.width, H = this.height;
    return Math.abs(p.motion.tx - motion.tx) * W < 0.5
        && Math.abs(p.motion.ty - motion.ty) * H < 0.5
        && Math.abs(p.motion.a - motion.a) < 1e-3
        && Math.abs(p.motion.b - motion.b) < 1e-3
        && Math.abs(p.motion.c - motion.c) < 1e-3
        && Math.abs(p.motion.d - motion.d) < 1e-3
        && p.cover.x === cover.x && p.cover.y === cover.y;
  }

  /** Grosor en unidades mundo: se calcula para MEDIR en pantalla
   *  `strokeWidth · lado corto` con la cámara en reposo; el zoom del
   *  movimiento de cámara lo escala de forma natural (como a la escena). */
  _updateLineWidth() {
    const pxPerWorld = (this.width * this._cover.x + this.height * this._cover.y) / 2;
    this._lw = Math.max(0.001, CONFIG.ar.strokeWidth * Math.min(this.width, this.height) / Math.max(pxPerWorld, 1e-6));
  }

  /** Pantalla (uv, y↓) → mundo. Para convertir los puntos nuevos de tinta. */
  fromScreen(sx, sy) {
    const S = this._cover;
    const vx = (sx - 0.5) / S.x + 0.5;
    const vy = (sy - 0.5) / S.y + 0.5;
    const M = invert(this._motion);
    return { x: M.a * vx + M.c * vy + M.tx, y: M.b * vx + M.d * vy + M.ty };
  }

  /** Mundo → pantalla (uv, y↓). Diagnóstico/tests. */
  worldToScreen(p) {
    const m = this._fullTransform();
    return { x: (m.a * p.x + m.c * p.y + m.tx) / this.width, y: (m.b * p.x + m.d * p.y + m.ty) / this.height };
  }

  /** Baja el lápiz en un punto mundo; un solo punto pinta un punto. */
  begin(p) {
    this._current = { points: [p] };
    this.strokes.push(this._current);
    this._drawDot(p);
    this.texture.needsUpdate = true;
  }

  /** Extiende el trazo activo; corta y empieza otro si la punta «salta»
   *  (pérdida y reaparición de la mano en frames consecutivos). */
  extend(p) {
    if (!this._current) {
      this.begin(p);
      return;
    }
    const last = this._current.points[this._current.points.length - 1];
    // Corte si el salto en pantalla excede el umbral (comparado en px).
    const m = this._fullTransform();
    const ax = m.a * last.x + m.c * last.y + m.tx, ay = m.b * last.x + m.d * last.y + m.ty;
    const bx = m.a * p.x + m.c * p.y + m.tx, by = m.b * p.x + m.d * p.y + m.ty;
    const jump = Math.hypot(bx - ax, by - ay) / Math.max(this.width, this.height);
    if (jump > CONFIG.ar.breakJump) {
      this.end();
      this.begin(p);
      return;
    }
    this._current.points.push(p);
    this._drawSegment(last, p);
    this.texture.needsUpdate = true;
  }

  /** Levanta el lápiz (el trazo queda persistido en this.strokes). */
  end() {
    this._current = null;
  }

  undo() {
    this.end();
    this.strokes.pop();
    this._redraw();
  }

  clear() {
    this.end();
    this.strokes.length = 0;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // clearRect en espacio de lienzo
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.texture.needsUpdate = true;
  }

  dispose() {
    removeEventListener('resize', this._onResize);
    this.texture.dispose();
  }

  /* --- internals -------------------------------------------------------- */

  /** Re-crea el lienzo al tamaño del viewport (con tope) y re-proyecta. */
  _resize() {
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
    const scale = Math.min(1, CONFIG.ar.maxStrokeCanvas / Math.max(vw, vh));
    this.width = Math.max(1, Math.round(vw * scale));
    this.height = Math.max(1, Math.round(vh * scale));
    this._updateLineWidth();
    this._redraw(true);
  }

  _applyStyle() {
    const ctx = this.ctx;
    ctx.strokeStyle = ctx.fillStyle = '#fff'; // blanco: solo importa el alfa
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = this._lw;
  }

  _drawDot(p) {
    this._applyStyle();
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, this._lw / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  _drawSegment(a, b) {
    this._applyStyle();
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y);
    this.ctx.lineTo(b.x, b.y);
    this.ctx.stroke();
  }

  /** Re-dibuja todos los trazos con la proyección actual (undo/resize/movimiento). */
  _redraw() {
    const m = this._fullTransform();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.setTransform(m.a, m.b, m.c, m.d, m.tx, m.ty);
    for (const stroke of this.strokes) this._paintStroke(stroke);
    this.texture && (this.texture.needsUpdate = true);
  }

  _paintStroke(stroke) {
    const pts = stroke.points;
    if (pts.length === 1) {
      this._drawDot(pts[0]);
      return;
    }
    this._applyStyle();
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) this.ctx.lineTo(pts[i].x, pts[i].y);
    this.ctx.stroke();
  }
}

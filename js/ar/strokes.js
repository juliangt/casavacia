/* ============================================================================
 * AR — lienzo de trazos del modo «dibujo en el aire»
 *
 * Canvas 2D offscreen TRANSPARENTE con trazos blancos: los shaders solo
 * muestrean su canal alfa (applyInk), así que el color de tinta lo pone el
 * filtro activo. La THREE.CanvasTexture asociada se sube a GPU solo mientras
 * se dibuja (needsUpdate).
 *
 * Los puntos se guardan en coords normalizadas de viewport → el re-redibujo
 * (undo/clear/resize) es correcto a cualquier tamaño de pantalla.
 * ========================================================================== */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class StrokeCanvas {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.strokes = [];   // [{ points: [{x, y}] }] en coords normalizadas (y↓)
    this._current = null;
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

  /** Baja el lápiz en (x, y) normalizado; un solo punto pinta un punto. */
  begin(x, y) {
    this._current = { points: [{ x, y }] };
    this.strokes.push(this._current);
    this._drawDot(x, y);
    this.texture.needsUpdate = true;
  }

  /** Extiende el trazo activo; corta y empieza otro si la punta «salta»
   *  (pérdida y reaparición de la mano en frames consecutivos). */
  extend(x, y) {
    if (!this._current) {
      this.begin(x, y);
      return;
    }
    const last = this._current.points[this._current.points.length - 1];
    const jump = Math.hypot((x - last.x) * this.width, (y - last.y) * this.height)
               / Math.max(this.width, this.height);
    if (jump > CONFIG.ar.breakJump) {
      this.end();
      this.begin(x, y);
      return;
    }
    this._current.points.push({ x, y });
    // Solo el segmento nuevo: los cap/join redondos hacen que el resultado
    // sea idéntico a repintar la polilínea completa, sin coste O(n) por frame.
    this._drawSegment(last, { x, y });
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
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.texture.needsUpdate = true;
  }

  dispose() {
    removeEventListener('resize', this._onResize);
    this.texture.dispose();
  }

  /* --- internals -------------------------------------------------------- */

  /** Re-crea el lienzo al tamaño actual del viewport (con tope) y re-dibuja. */
  _resize() {
    const vw = Math.max(1, innerWidth), vh = Math.max(1, innerHeight);
    const scale = Math.min(1, CONFIG.ar.maxStrokeCanvas / Math.max(vw, vh));
    this.width = Math.max(1, Math.round(vw * scale));
    this.height = Math.max(1, Math.round(vh * scale));
    this._scale = scale;
    this._redraw();
  }

  _strokeWidth() {
    return Math.max(2, CONFIG.ar.strokeWidth * Math.min(this.width, this.height));
  }

  _applyStyle() {
    const ctx = this.ctx;
    ctx.strokeStyle = ctx.fillStyle = '#fff'; // blanco: solo importa el alfa
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = this._strokeWidth();
  }

  _px(p) {
    return [p.x * this.width, p.y * this.height];
  }

  _drawDot(x, y) {
    this._applyStyle();
    this.ctx.beginPath();
    this.ctx.arc(x * this.width, y * this.height, this._strokeWidth() / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  _drawSegment(a, b) {
    this._applyStyle();
    const [ax, ay] = this._px(a), [bx, by] = this._px(b);
    this.ctx.beginPath();
    this.ctx.moveTo(ax, ay);
    this.ctx.lineTo(bx, by);
    this.ctx.stroke();
  }

  /** Re-dibuja todos los trazos persistidos (undo / clear / resize). */
  _redraw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const stroke of this.strokes) this._paintStroke(stroke);
    this.texture && (this.texture.needsUpdate = true);
  }

  _paintStroke(stroke) {
    const pts = stroke.points;
    if (pts.length === 1) {
      this._drawDot(pts[0].x, pts[0].y);
      return;
    }
    this._applyStyle();
    this.ctx.beginPath();
    const [x0, y0] = this._px(pts[0]);
    this.ctx.moveTo(x0, y0);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = this._px(pts[i]);
      this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
  }
}

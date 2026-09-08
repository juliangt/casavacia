/* ============================================================================
 * DemoSource — fuente sintética (solo desarrollo, ?demo):
 * permite iterar shaders sin cámara. Misma interfaz que CameraSource.
 * ========================================================================== */
import * as THREE from 'three';

export class DemoSource {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d');
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  update(tms) {
    const t = tms / 1000, c = this.canvas, ctx = this.ctx;
    const W = c.width, H = c.height;

    // Fondo con gradiente vertical (zonas de luz/sombra para el lápiz).
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#f4f3ef');
    bg.addColorStop(1, '#b9bab4');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Rampa de luminancia (prueba de sombreado por bandas).
    const ramp = ctx.createLinearGradient(24, 0, 344, 0);
    for (let i = 0; i <= 10; i++) ramp.addColorStop(i / 10, `hsl(0,0%,${100 - i * 10}%)`);
    ctx.fillStyle = ramp;
    ctx.fillRect(24, 24, 320, 56);

    // Círculos de colores en órbita (prueba de cel-shading).
    ['#c0392b', '#27ae60', '#2980b9', '#e67e22'].forEach((col, i) => {
      const x = W / 2 + Math.cos(t * (0.4 + i * 0.13) + i * 1.7) * (W * 0.30);
      const y = H / 2 + Math.sin(t * (0.5 + i * 0.11) + i * 2.3) * (H * 0.30);
      ctx.beginPath();
      ctx.arc(x, y, 64 + i * 15, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    });

    // Rectángulo oscuro rotatorio (bordes fuertes para Sobel).
    ctx.save();
    ctx.translate(W / 2 + Math.sin(t * 0.3) * 200, H / 2 + Math.cos(t * 0.22) * 140);
    ctx.rotate(t * 0.6);
    ctx.fillStyle = '#22242a';
    ctx.fillRect(-130, -70, 260, 140);
    ctx.restore();

    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); }
}

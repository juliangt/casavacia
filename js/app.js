/* ============================================================================
 * MOTOR Three.js — renderer, escena, materiales por filtro y bucle de render.
 *
 * No conoce el DOM de la UI: para visualizar métricas por frame se puede
 * pasar `{ onFrame(t) }` en el constructor (lo usa main.js para el FPS).
 * ========================================================================== */
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { FILTERS, DEFAULT_FILTER } from './filters.js';
import { VERTEX_SHADER, FRAG_PRELUDE } from './shaders/common.js';

export class App {
  constructor(canvas, { onFrame } = {}) {
    this.canvas = canvas;
    this.onFrame = onFrame;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,               // post-proceso fullscreen: no aporta
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxPixelRatio));

    // Cámara ortográfica + quad de pantalla completa (NDC -1..1).
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Uniforms compartidos: los materiales referencian los MISMOS objetos
    // { value } → una sola actualización sirve para todos los filtros.
    this.shared = {
      uTexture: { value: null },
      uTexel:   { value: new THREE.Vector2(1, 1) },
      uUvScale: { value: new THREE.Vector2(1, 1) },
      uTime:    { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };

    this.materials = {};
    for (const [id, f] of Object.entries(FILTERS)) {
      this.materials[id] = new THREE.ShaderMaterial({
        uniforms: { ...this.shared, ...f.uniforms }, // refs compartidas + propios
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAG_PRELUDE + f.fragment,
      });
    }

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.materials[DEFAULT_FILTER]);
    this.scene.add(this.mesh);

    this.source = null;
    this._onResize = () => this.resize();
  }

  start() {
    addEventListener('resize', this._onResize);
    this.resize();
    this.renderer.setAnimationLoop(this._tick);
  }

  setSource(source) {
    this.source = source;
    this.shared.uTexture.value = source?.texture ?? null;
    if (source) {
      this.shared.uTexel.value.set(1 / source.width, 1 / source.height);
      this.updateUvScale();
    }
  }

  setFilter(id) {
    this.mesh.material = this.materials[id];
  }

  /** Recorta el video tipo "cover": llena la pantalla sin deformar. */
  updateUvScale() {
    if (!this.source) return;
    const va = this.source.width / this.source.height;      // aspecto del video
    const ca = this.canvas.width / this.canvas.height;      // aspecto del canvas
    this.shared.uUvScale.value.set(
      Math.min(1, ca / va),   // video más ancho que el canvas → recorta laterales
      Math.min(1, va / ca),   // video más alto  que el canvas → recorta arriba/abajo
    );
  }

  resize() {
    // tope de DPR aplicado también al girar el móvil / mover la ventana
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxPixelRatio));
    this.renderer.setSize(innerWidth, innerHeight, false); // false: CSS ya es 100%
    // Tamaño del framebuffer (px × DPR): coincide con el rango de gl_FragCoord.
    this.shared.uResolution.value.set(this.canvas.width, this.canvas.height);
    this.updateUvScale();
  }

  _tick = (t) => {
    if (!this.shared.uTexture.value) return; // aún no hay cámara: no gastar GPU
    this.shared.uTime.value = t / 1000;
    this.source?.update?.(t);
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.(t);
  };

  /** Liberación completa de recursos (reinicios / descarte de la página). */
  dispose() {
    this.renderer.setAnimationLoop(null);
    removeEventListener('resize', this._onResize);
    this.source?.dispose();
    this.source = null;
    this.shared.uTexture.value = null;
    this.mesh.geometry.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    this.renderer.dispose();
  }
}

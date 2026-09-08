/* ============================================================================
 * FUENTES DE VIDEO — interfaz común:
 *   { start(), update(t), dispose(), width, height, texture }
 *
 * CameraSource: getUserMedia + <video> oculto + THREE.VideoTexture
 * ========================================================================== */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const once = (el, ev) => new Promise(res => el.addEventListener(ev, res, { once: true }));

export class CameraSource {
  constructor(videoEl, onEnded) {
    this.video = videoEl;
    this.onEnded = onEnded;
    this.stream = null;
    this.texture = null;
    this.width = 0;
    this.height = 0;
  }

  async start() {
    if (!window.isSecureContext) {
      const e = new Error('getUserMedia requiere un contexto seguro (https:// o localhost).');
      e.name = 'InsecureContext';
      throw e;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const e = new Error('Este navegador no soporta getUserMedia.');
      e.name = 'NotSupportedError';
      throw e;
    }

    // facingMode "ideal" → pide la trasera pero no falla si solo hay frontal.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: CONFIG.video.facingMode },
        width:  { ideal: CONFIG.video.width  },
        height: { ideal: CONFIG.video.height },
      },
    });

    const v = this.video;
    v.muted = true;            // refuerzo del atributo HTML (autoplay policies)
    v.playsInline = true;
    v.srcObject = this.stream;

    // Esperar metadatos (dimensiones reales del stream), con margen de error.
    await Promise.race([
      once(v, 'loadedmetadata'),
      new Promise((_, rej) => setTimeout(() => {
        const e = new Error('La cámara tardó demasiado en responder.');
        e.name = 'TimeoutError';
        rej(e);
      }, CONFIG.video.requestTimeoutMs)),
    ]);

    // muted + playsinline ⇒ puede arrancar sin gesto de usuario.
    await v.play().catch(() => {});

    // Algunos Android reportan 0x0 en loadedmetadata: esperar al primer frame.
    if (!v.videoWidth) {
      await Promise.race([once(v, 'resize'), new Promise(r => setTimeout(r, 2000))]);
    }
    this.width  = v.videoWidth  || CONFIG.video.width;
    this.height = v.videoHeight || CONFIG.video.height;

    // Aviso si la cámara se corta a mitad de sesión (app en 2º plano, HW, etc.)
    const track = this.stream.getVideoTracks()[0];
    track?.addEventListener('ended', () => this.onEnded?.());

    // Textura NPOT → sin mipmaps y filtrado lineal (requerido en móvil).
    const tex = new THREE.VideoTexture(v);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    this.texture = tex;
  }

  update() { /* VideoTexture se auto-actualiza desde el renderer */ }

  dispose() {
    this.stream?.getTracks().forEach(t => t.stop()); // libera el LED/hardware
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.texture?.dispose();
    this.texture = null;
  }
}

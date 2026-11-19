// Convierte modelos 3D (Kenney, CC0) en imágenes isométricas con luz propia. Solo para desarrollo.
// La vista es la del juego: «2:1» (cada casilla de 1×1 se ve como un rombo de 2:1) con la cámara girada 45°.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// El arte se dibuja a ART veces el tamaño lógico del juego (ART_SCALE en src/data/config.js): así se ve nítido en pantallas
// de mucha densidad. Si cambias ART, cambia también ART_SCALE, SHEET (unitArt.js) y regenera artBoxes.js.
export const ART = 1.5;
export const TILE_W = 96 * ART; // ancho en píxeles de un bloque de 2×2 cuadros a zoom 1: la altura es la mitad
const YAW = Math.PI / 4;
const PITCH = Math.PI / 6; // 30°: da el rombo 2:1
const PPU = TILE_W / (2 * Math.cos(YAW)); // píxeles por unidad del modelo (a lo largo de x o z)

const PACKS = { castle: '/models/castle/Models/GLB format/', town: '/models/town/Models/GLB format/', chars: '/models/chars/Models/GLB format/' };
const loader = new GLTFLoader();
const cache = new Map();

/** Carga un modelo (con caché). Devuelve { scene, animations }. */
export async function load(pack, name) {
  const key = `${pack}/${name}`;
  if (!cache.has(key)) cache.set(key, loader.loadAsync(`${PACKS[pack]}${name}.glb`));
  return cache.get(key);
}

/** Copia independiente de un modelo (sirve también para los que tienen esqueleto). */
export async function make(pack, name) {
  const gltf = await load(pack, name);
  const obj = SkeletonUtils.clone(gltf.scene);
  obj.userData.animations = gltf.animations;
  obj.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.roughness = 1;
      o.material.metalness = 0;
    }
  });
  return obj;
}

/** Tamaño de una pieza, en unidades del modelo. */
export function sizeOf(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return { min: box.min.toArray().map((n) => +n.toFixed(2)), max: box.max.toArray().map((n) => +n.toFixed(2)) };
}

/* ---------- color: cambiar la paleta del modelo ---------- */

/** Aplica `fn(r, g, b) -> [r, g, b]` (0-255) a la textura de colores de todo el modelo. */
export function recolor(obj, fn) {
  const done = new Map();
  obj.traverse((o) => {
    if (!o.isMesh || !o.material.map) return;
    const src = o.material.map;
    if (!done.has(src)) {
      const c = document.createElement('canvas');
      c.width = src.image.width;
      c.height = src.image.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(src.image, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.data.length; i += 4) {
        const [r, g, b] = fn(data.data[i], data.data[i + 1], data.data[i + 2]);
        data.data[i] = r;
        data.data[i + 1] = g;
        data.data[i + 2] = b;
      }
      ctx.putImageData(data, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.flipY = src.flipY;
      tex.colorSpace = src.colorSpace;
      tex.magFilter = THREE.NearestFilter; // la paleta es de colores planos
      tex.minFilter = THREE.NearestFilter;
      done.set(src, tex);
    }
    o.material.map = done.get(src);
    o.material.needsUpdate = true;
  });
  return obj;
}

export function hsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, max === 0 ? 0 : d / max, max];
}

export function rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/* ---------- cámara, luces y render ---------- */

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6d7d58, 1.15));
  const sun = new THREE.DirectionalLight(0xffe6bd, 2.3);
  sun.position.set(-4, 7, 3.5); // luz desde arriba a la izquierda (la sombra cae hacia la derecha)
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 6;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: 30 });
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 4;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.5);
  fill.position.set(5, 3, -4);
  scene.add(fill);
}

/**
 * Dibuja `obj` y devuelve un canvas W×H. (ox, oy) es el píxel donde cae el centro de su casilla en el suelo.
 * `ground` pone un suelo que solo recibe sombras (no se ve el suelo, solo la sombra que proyecta el modelo).
 */
export function render(obj, { W = 192, H = 192, ox = W / 2, oy = H * 0.78, SS = 2, ground = false } = {}) {
  const scene = new THREE.Scene();
  lights(scene);
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(obj);
  if (ground) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.38 }));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    scene.add(g);
  }
  const cam = new THREE.OrthographicCamera(-ox / PPU, (W - ox) / PPU, oy / PPU / Math.cos(PITCH), -(H - oy) / PPU / Math.cos(PITCH), 0.1, 100);
  const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
  cam.position.copy(dir.multiplyScalar(30));
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  renderer.setPixelRatio(1);
  renderer.setSize(W * SS, H * SS, false);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderer.domElement, 0, 0, W, H);
  scene.remove(obj);
  return out;
}

/** Envía un canvas al servidor para guardarlo como PNG (en la carpeta de salida). */
export async function save(canvas, name) {
  const r = await fetch(`/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: canvas.toDataURL('image/png') });
  return r.ok;
}

/** Pone un canvas en la página con una etiqueta (para mirarlo). */
export function show(canvas, label) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.append(canvas);
  const t = document.createElement('div');
  t.textContent = label;
  cell.append(t);
  document.getElementById('out').append(cell);
}

/** Pone la animación `clipName` de un personaje en el instante `t` (segundos). Devuelve lo que dura. */
export function pose(obj, clipName, t) {
  const clip = obj.userData.animations.find((a) => a.name === clipName);
  if (!clip) throw new Error(`sin animación ${clipName}`);
  const mixer = obj.userData.mixer ?? (obj.userData.mixer = new THREE.AnimationMixer(obj));
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.play();
  mixer.setTime(t);
  return clip.duration;
}

window.iso = { THREE, load, make, sizeOf, recolor, hsv, rgb, render, save, show, pose, TILE_W, PPU, ART };
document.title = 'iso listo';

// Scene, camera, lighting, environment map, renderer. No postprocessing, no real
// shadow maps — a blurred contact-shadow plane fakes the ground shadow (per the brief).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);

  // Environment map for crisp metal reflections (generated, no CDN fetch).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  // Camera: fixed three-quarter view looking down into the bowl (~45deg).
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);

  // --- Lighting: three-point studio ---------------------------------------
  const key = new THREE.DirectionalLight(0xfff2df, 2.4);
  key.position.set(0.5, 1.1, 0.6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.7);
  fill.position.set(-0.8, 0.5, -0.3);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(-0.2, 0.6, -1.0);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0x6b7280, 0x0a0a0c, 0.35));

  // --- Fake blurred contact shadow ----------------------------------------
  const shadowTex = makeRadialShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.001;
  scene.add(shadow);

  return { renderer, scene, camera, pmrem };
}

// Recursively dispose geometries/materials/textures under a subtree. Needed
// when the settings panel rebuilds the wheel for a new mode/space-count —
// three.js doesn't garbage-collect GPU resources on its own.
export function disposeObject3D(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}

function makeRadialShadowTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Straight TOP-DOWN framing (no isometric tilt). The whole wheel is fit into the
// space LEFT of the right-hand panel so it never sits behind the UI. Derived from
// the panel's actual width (matches the CSS clamp) so it adapts to any aspect.
//
// opts.push  (0..1) — subtle push-in as the ball leaves the track.
// opts.focus (0..1) — after the ball settles, zoom in hard and recentre on the
//                     winning pocket (opts.ballX/ballZ, followed as the rotor turns).
export function fitCamera(camera, aspect, opts = {}) {
  const { push = 0, focus = 0, ballX = 0, ballZ = 0 } = opts;
  camera.aspect = aspect;
  camera.fov = 30;
  const fovY = (camera.fov * Math.PI) / 180;
  const tanY = Math.tan(fovY / 2);
  const tanX = tanY * aspect;

  const W = typeof window !== 'undefined' ? window.innerWidth : 1180;
  // Panel width matches the CSS: clamp(240, 24vw, 340) + margins/gap.
  const panelW = Math.min(340, Math.max(240, 0.24 * W)) + 34;
  const f = Math.min(0.55, panelW / W); // right-hand fraction covered by the panel

  const R = 0.44; // wheel radius (incl. rim) to keep framed, with margin
  // Top-down: world X spans the screen width, world Z spans the height. Fit both.
  const distH = R / ((1 - f) * tanX * 0.96); // horizontal into the left region
  const distV = R / (tanY * 0.96); // vertical into full height
  let dist = Math.max(distH, distV);
  dist *= (1 - 0.1 * push) * (1 - 0.62 * focus); // push-in, then deep focus zoom

  const panX = f * tanX * dist; // keep the look point in the centre of the left region
  // Blend the look target from the wheel centre to the winning pocket.
  const lookX = panX + focus * ballX;
  const lookZ = focus * ballZ;

  camera.up.set(0, 0, -1); // define orientation for a straight-down look
  camera.position.set(lookX, dist, lookZ);
  camera.lookAt(lookX, 0, lookZ);
  camera.updateProjectionMatrix();
}

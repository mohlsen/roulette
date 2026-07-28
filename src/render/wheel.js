// Wheel geometry: stationary bowl + deflectors, and the spinning rotor (pockets,
// frets, numbers, turret). Built in SI metres. The angle convention is defined
// locally (toXZ) and the rotor is rotated by -theta_r so that the pocket rendered
// under the ball is exactly the sim's pocketIndex = floor((theta_b - theta_r)/w).

import * as THREE from 'three';
import { getActiveLayout } from '../data/layouts.js';

const TWO_PI = Math.PI * 2;

// Angle -> XZ position (Y up). MUST match the ball placement in ball.js.
export function toXZ(angle, r) {
  return [r * Math.cos(angle), r * Math.sin(angle)];
}

const COLORS = {
  wood: 0x241812,
  brass: 0xc7a15a,
  brassDark: 0x8a6a34,
  red: 0x9a1f1f,
  black: 0x0d0d10,
  green: 0x0c6b34,
  fret: 0xd8b978,
};

function brassMat() {
  return new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 1.0, roughness: 0.28 });
}

// Surface height (metres) the ball rides at for a given radius. Matches the bowl
// profile below so the ball visually sits on the track / apron / pocket floor.
export function surfaceHeight(r, geom) {
  const { pocketOuterRadius: po, trackRadius: tr } = geom;
  const trackY = 0.04;
  if (r >= tr) return trackY;
  if (r <= po) return 0;
  const f = (r - po) / (tr - po);
  return f * trackY;
}

export function createWheel(config) {
  const geom = config.geom;
  const { values: layout, colorKeys } = getActiveLayout(config);
  const N = layout.length;
  const w = TWO_PI / N;

  const root = new THREE.Group();

  // ---- Stationary bowl (lathe) ------------------------------------------
  const profile = [
    new THREE.Vector2(geom.pocketOuterRadius, -0.006),
    new THREE.Vector2(geom.pocketOuterRadius + 0.006, -0.004),
    new THREE.Vector2(geom.trackRadius - 0.03, 0.046),
    new THREE.Vector2(geom.trackRadius, 0.038), // track groove
    new THREE.Vector2(geom.trackRadius + 0.035, 0.082), // bank wall
    new THREE.Vector2(geom.bowlRadius, 0.092), // outer rim top
    new THREE.Vector2(geom.bowlRadius + 0.006, 0.05),
  ];
  const bowlGeo = new THREE.LatheGeometry(profile, 160);
  const bowlMat = new THREE.MeshStandardMaterial({
    color: COLORS.wood,
    metalness: 0.15,
    roughness: 0.32,
    side: THREE.DoubleSide,
  });
  root.add(new THREE.Mesh(bowlGeo, bowlMat));

  // Solid underside disc so we don't see through to the shadow plane.
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(geom.bowlRadius + 0.006, geom.bowlRadius + 0.02, 0.05, 96),
    bowlMat,
  );
  base.position.y = -0.03; // sits BELOW the rotor plane so it caps the bowl underside
  root.add(base);

  // ---- Deflectors (8 diamonds on the apron) -----------------------------
  const defMat = brassMat();
  for (let i = 0; i < geom.numDeflectors; i++) {
    const a = (i / geom.numDeflectors) * TWO_PI + w * 0.5;
    const [x, z] = toXZ(a, geom.deflectorRadius);
    const y = surfaceHeight(geom.deflectorRadius, geom) + 0.012;
    const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.016), defMat);
    d.scale.set(1.0, 0.6, 1.7);
    d.position.set(x, y, z);
    d.rotation.y = -a + (i % 2 ? 0.4 : -0.4); // alternate orientation
    root.add(d);
  }

  // ---- Rotor (spins) -----------------------------------------------------
  const rotorGroup = new THREE.Group();
  root.add(rotorGroup);

  // Baked top-down texture: coloured pockets + numbers, aligned via toXZ.
  const faceTex = makeRotorFaceTexture(layout, colorKeys, N, w, geom);
  const faceR = geom.pocketOuterRadius;
  const faceGeo = new THREE.CircleGeometry(faceR, 128);
  // Planar UVs centred on the disc (CircleGeometry already provides these).
  const faceMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    metalness: 0.1,
    roughness: 0.45,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.rotation.x = -Math.PI / 2; // lay flat in XZ
  face.position.y = 0.001;
  rotorGroup.add(face);

  // Raised frets (separators) between pockets.
  const fretMat = new THREE.MeshStandardMaterial({ color: COLORS.fret, metalness: 1.0, roughness: 0.22 });
  const fretLen = geom.pocketOuterRadius - geom.pocketInnerRadius;
  const fretGeo = new THREE.BoxGeometry(0.0035, geom.fretHeight, fretLen);
  for (let k = 0; k < N; k++) {
    const a = k * w; // fret sits on the pocket boundary
    const rMid = (geom.pocketInnerRadius + geom.pocketOuterRadius) / 2;
    const [x, z] = toXZ(a, rMid);
    const fret = new THREE.Mesh(fretGeo, fretMat);
    fret.position.set(x, geom.fretHeight / 2, z);
    fret.rotation.y = -a; // box's local Z points radially outward
    rotorGroup.add(fret);
  }

  // Outer pocket wall ring.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(geom.pocketOuterRadius, geom.pocketOuterRadius, 0.016, 128, 1, true),
    new THREE.MeshStandardMaterial({ color: COLORS.brassDark, metalness: 1.0, roughness: 0.35, side: THREE.DoubleSide }),
  );
  wall.position.y = 0.008;
  rotorGroup.add(wall);

  // ---- Turret / spindle (brass centrepiece) -----------------------------
  const turret = new THREE.Group();
  const coneMat = brassMat();
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(geom.pocketInnerRadius, 0.05, 96),
    coneMat,
  );
  cone.position.y = 0.025;
  turret.add(cone);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.018, 0.085, 32), coneMat);
  spindle.position.y = 0.078;
  turret.add(spindle);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 32, 24), coneMat);
  knob.position.y = 0.125;
  turret.add(knob);
  // Cross-bar handles on top (classic look).
  const barMat = brassMat();
  for (let i = 0; i < 2; i++) {
    const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.1, 6, 12), barMat);
    bar.rotation.z = Math.PI / 2;
    bar.rotation.y = i * Math.PI / 2;
    bar.position.y = 0.14;
    turret.add(bar);
  }
  rotorGroup.add(turret);

  return { root, rotorGroup, surfaceHeight: (r) => surfaceHeight(r, geom), N, w };
}

// ---- Baked rotor-face texture --------------------------------------------
function makeRotorFaceTexture(layout, colorKeys, N, w, geom) {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const R = geom.pocketOuterRadius; // maps to size/2
  const pr = (r) => (r / R) * (size / 2);

  // Background (inner turret area) dark.
  ctx.fillStyle = '#161016';
  ctx.fillRect(0, 0, size, size);

  const prIn = pr(geom.pocketInnerRadius);
  const prOut = pr(geom.pocketOuterRadius) - 4;
  const numFrac = 0.5; // centre of the pocket band — maximises headroom before clipping either edge
  const prNum = pr(geom.pocketInnerRadius + (geom.pocketOuterRadius - geom.pocketInnerRadius) * numFrac);

  // Size the font to fill whatever room is actually available, in BOTH
  // directions — tangential (per-pocket arc width) and radial (pocket band
  // height) — rather than a fixed size that leaves small wheels (fewer, wider
  // pockets) looking under-filled. Measured against the widest label so every
  // pocket on a given wheel shares one consistent size.
  const bandPx = pr(geom.pocketOuterRadius) - pr(geom.pocketInnerRadius);
  const maxLabel = layout.reduce((longest, v) => (String(v).length > longest.length ? String(v) : longest), '0');
  const refSize = 100;
  ctx.font = `bold ${refSize}px "Arial Narrow", Arial, sans-serif`;
  const refWidth = ctx.measureText(maxLabel).width;

  const arcLen = (TWO_PI * prNum) / N;
  const widthLimit = (refSize * (arcLen * 0.82)) / refWidth; // font size that just fits the arc
  // Text is vertically centred at prNum, so it has `bandPx * numFrac` of room on
  // each side before it clips the inner or outer edge — use the smaller margin.
  const radialMargin = bandPx * Math.min(numFrac, 1 - numFrac);
  const heightLimit = radialMargin * 2 * 0.8; // *2 for both sides, 0.8 safety margin
  const fontSize = Math.max(20, Math.min(260, Math.min(widthLimit, heightLimit)));

  for (let k = 0; k < N; k++) {
    const a0 = k * w;
    const a1 = (k + 1) * w;
    const value = layout[k];
    const col = colorKeys[k];
    const fill = col === 'red' ? '#9a1f1f' : col === 'green' ? '#0c6b34' : '#0d0d10';

    // Coloured pocket wedge (canvas arc angles match the toXZ / UV convention).
    ctx.beginPath();
    ctx.moveTo(cx + prIn * Math.cos(a0), cy + prIn * Math.sin(a0));
    ctx.arc(cx, cy, prOut, a0, a1);
    ctx.arc(cx, cy, prIn, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // Number, oriented radially, near the outer edge.
    const ac = (k + 0.5) * w;
    ctx.save();
    ctx.translate(cx + prNum * Math.cos(ac), cy + prNum * Math.sin(ac));
    ctx.rotate(ac + Math.PI / 2); // text reads pointing inward->outward
    ctx.fillStyle = '#f4efe4';
    ctx.font = `bold ${fontSize}px "Arial Narrow", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), 0, 0);
    ctx.restore();
  }

  // Inner ring outline.
  ctx.beginPath();
  ctx.arc(cx, cy, prIn, 0, TWO_PI);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

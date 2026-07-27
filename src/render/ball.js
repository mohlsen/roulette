// Ball renderer. Position is driven ENTIRELY by the sim's (theta_b, r_b) plus the
// bowl surface height. The only render-only flourish is a short vertical hop that
// is *triggered* by physics events (deflector / fret hits) — it never feeds back
// into the outcome and never moves the ball off its simulated (theta, r).

import * as THREE from 'three';
import { toXZ } from './wheel.js';

export function createBall(config, surfaceHeight) {
  const geom = config.geom;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(geom.ballRadius, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0xf3ead2,
      metalness: 0.1,
      roughness: 0.22,
      envMapIntensity: 1.2,
    }),
  );

  let hopVel = 0;
  let hopY = 0;
  let lastDef = 0;
  let lastFret = 0;

  function reset(state) {
    hopVel = 0;
    hopY = 0;
    lastDef = state.deflectorHits;
    lastFret = state.fretHits;
  }

  // Called every render frame with the current sim state.
  function update(state, dt) {
    // Trigger a hop when a hit was registered since the last frame.
    if (state.deflectorHits > lastDef) {
      hopVel = Math.max(hopVel, 0.35);
      lastDef = state.deflectorHits;
    }
    if (state.fretHits > lastFret) {
      hopVel = Math.max(hopVel, 0.28);
      lastFret = state.fretHits;
    }
    // Damped vertical bounce (visual only).
    hopVel -= 9.81 * dt;
    hopY += hopVel * dt;
    if (hopY <= 0) {
      hopY = 0;
      hopVel = 0;
    }

    const [x, z] = toXZ(state.theta_b, state.r_b);
    const y = surfaceHeight(state.r_b) + geom.ballRadius + hopY;
    mesh.position.set(x, y, z);
  }

  return { mesh, update, reset };
}

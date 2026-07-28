// Reduced-order roulette model in cylindrical coordinates (theta, r, z).
// This is the SOURCE OF TRUTH for the outcome. It imports nothing from three.js and
// runs unchanged in Node — that is what keeps the fairness check cheap and the
// outcome honest. The renderer (phase 2) only reads state produced here.
//
// The winning number is NEVER chosen. Randomness enters at launch and in per-bounce
// scatter; the pocket is read from the ball's final angle relative to the rotor.

import { getActiveLayout } from '../data/layouts.js';

export const PHASE = {
  TRACK: 0, // ball riding the banked outer track
  DESCENT: 1, // spiralling inward across the apron, striking deflectors
  FRET: 2, // hopping across the rotating pocket ring
  SETTLED: 3, // nested in a pocket, riding with the rotor
};

const TWO_PI = Math.PI * 2;

function wrap2pi(x) {
  const r = x - TWO_PI * Math.floor(x / TWO_PI);
  return r < 0 ? r + TWO_PI : r;
}

// Create a fresh state object. One allocation per spin (not per step).
export function createState() {
  return {
    phase: PHASE.TRACK,
    t: 0,

    // rotor
    theta_r: 0,
    omega_r: 0, // > 0 (spins one way)

    // ball
    theta_b: 0,
    omega_b: 0, // < 0 (opposite the rotor)
    r_b: 0,
    z_b: 0,
    vr_b: 0,
    vz_b: 0,

    // bookkeeping
    revBeforeDrop: 0,
    deflectorHits: 0,
    fretHits: 0,
    _defCooldown: 0,
    _lastDefIndex: -1,
    _lastFretIndex: 0,
    _calmTime: 0,

    // result
    pocketIndex: -1,
    winningNumber: null,
  };
}

// Randomize initial conditions from the RNG. `launchBias` (0..1, optional) lets a
// dealer swipe push the ball speed toward the top of the range.
export function initSpin(state, cfg, rng, launchBias = null) {
  const b = cfg.ball;
  const r = cfg.rotor;

  state.phase = PHASE.TRACK;
  state.t = 0;

  state.theta_r = rng.range(0, TWO_PI);
  state.omega_r = rng.range(r.omegaStart[0], r.omegaStart[1]);

  state.theta_b = rng.range(0, TWO_PI);
  // ball opposite the rotor -> negative omega
  let launchSpeed;
  if (launchBias == null) {
    launchSpeed = rng.range(b.omegaStart[0], b.omegaStart[1]);
  } else {
    const lo = b.omegaStart[0];
    const hi = b.omegaStart[1];
    const bias = Math.max(0, Math.min(1, launchBias));
    // map swipe strength across the range, plus a little jitter for entropy
    launchSpeed = lo + (hi - lo) * bias + rng.jitter(0.4);
  }
  state.omega_b = -launchSpeed;
  state.r_b = cfg.geom.trackRadius;
  state.z_b = cfg.geom.fretHeight + 0.02; // riding above the pocket plane
  state.vr_b = 0;
  state.vz_b = 0;

  state.revBeforeDrop = 0;
  state.deflectorHits = 0;
  state.fretHits = 0;
  state._defCooldown = 0;
  state._lastDefIndex = -1;
  state._calmTime = 0;

  state.pocketIndex = -1;
  state.winningNumber = null;
}

// Advance one fixed timestep. Mutates `state`. Allocation-free.
export function step(state, cfg, rng) {
  const dt = cfg.sim.dt;
  const g = cfg.g;
  const geom = cfg.geom;

  state.t += dt;

  // --- Rotor: Coulomb + viscous drag, never stops during a spin --------------
  const rdec = cfg.rotor.a + cfg.rotor.b * state.omega_r;
  state.omega_r = Math.max(0, state.omega_r - rdec * dt);
  state.theta_r = wrap2pi(state.theta_r + state.omega_r * dt);

  if (state.phase === PHASE.SETTLED) {
    // Ball rides locked to the rotor frame.
    state.theta_b = wrap2pi(state.theta_r + state._settleRel);
    return;
  }

  const speed = Math.abs(state.omega_b); // angular speed magnitude
  const dir = -1; // ball travels in the negative direction throughout

  if (state.phase === PHASE.TRACK) {
    // Angular decay on the banked track.
    const dec = cfg.ball.trackA + cfg.ball.trackB * speed;
    const newSpeed = Math.max(0, speed - dec * dt);
    state.omega_b = dir * newSpeed;
    state.r_b = geom.trackRadius;
    state.theta_b = wrap2pi(state.theta_b + state.omega_b * dt);
    state.revBeforeDrop += (newSpeed * dt) / TWO_PI;

    // Leave-track condition: centripetal accel drops below g/tan(beta).
    const centripetal = newSpeed * newSpeed * geom.trackRadius;
    const threshold = cfg.ball.leaveFactor * (g / Math.tan(geom.trackBank));
    if (centripetal < threshold) {
      state.phase = PHASE.DESCENT;
      state.vr_b = -0.02; // small initial inward nudge off the rim
    }
    return;
  }

  if (state.phase === PHASE.DESCENT) {
    // Slide inward across the apron; gravity along the slope pulls toward centre,
    // damped by contact drag. (Centrifugal support is gone once off the banked rim.)
    const dvr = -cfg.descent.gravitySlide - cfg.descent.radialDamp * state.vr_b;
    state.vr_b += dvr * dt;
    state.r_b += state.vr_b * dt;

    // Tangential viscous drag off the track.
    const newSpeed = Math.max(0, speed - cfg.descent.tangentialDrag * speed * dt);
    state.omega_b = dir * newSpeed;
    state.theta_b = wrap2pi(state.theta_b + state.omega_b * dt);

    // Geometric z: interpolate down the apron as r shrinks.
    const frac = (state.r_b - geom.pocketOuterRadius) / (geom.trackRadius - geom.pocketOuterRadius);
    state.z_b = Math.max(0, frac) * (geom.fretHeight + 0.02);

    // --- Deflector strikes: the primary chaos amplifier ---------------------
    if (state._defCooldown > 0) state._defCooldown -= dt;
    if (
      state._defCooldown <= 0 &&
      state.r_b <= geom.trackRadius &&
      state.r_b >= geom.pocketOuterRadius - cfg.descent.deflectorBand
    ) {
      const spacing = TWO_PI / geom.numDeflectors;
      const idx = Math.floor(state.theta_b / spacing);
      if (idx !== state._lastDefIndex) {
        state._lastDefIndex = idx;
        // Strike: variable tangential restitution, inward radial kick, scatter.
        const rest = rng.range(cfg.descent.deflectorRestitution[0], cfg.descent.deflectorRestitution[1]);
        let s = newSpeed * rest + rng.jitter(cfg.descent.deflectorScatter);
        s = Math.max(0, s);
        state.omega_b = dir * s;
        state.vr_b -= rng.range(cfg.descent.deflectorRadialKick[0], cfg.descent.deflectorRadialKick[1]);
        state.deflectorHits += 1;
        state._defCooldown = cfg.descent.deflectorCooldown;
      }
    }

    // Reached the pocket ring -> hand off to the rotating-frame fret phase.
    if (state.r_b <= geom.pocketOuterRadius) {
      state.r_b = geom.pocketOuterRadius;
      state.phase = PHASE.FRET;
      const pocketWidth = TWO_PI / getActiveLayout(cfg).values.length;
      state._lastFretIndex = Math.floor(wrap2pi(state.theta_b - state.theta_r) / pocketWidth);
      state._calmTime = 0;
    }
    return;
  }

  if (state.phase === PHASE.FRET) {
    const layout = getActiveLayout(cfg).values;
    const N = layout.length;
    const pocketWidth = TWO_PI / N;

    // Continuous drag pulls the ball's RELATIVE speed toward zero, i.e. omega_b
    // toward omega_r: the moving frets/pocket walls drag the ball into the rotor
    // frame. (Dragging toward the bowl frame instead would never let it settle.)
    let relOmega0 = state.omega_b - state.omega_r;
    relOmega0 *= Math.max(0, 1 - cfg.fret.drag * dt);
    state.omega_b = state.omega_r + relOmega0;
    state.theta_b = wrap2pi(state.theta_b + state.omega_b * dt);

    // Ease radius to the pocket seat, biased toward the inner edge so the ball
    // rests just inside the number band rather than on top of it.
    const seat = geom.pocketInnerRadius - 0.006; // rest just inside the number band, against the hub
    state.r_b += (seat - state.r_b) * Math.min(1, 6 * dt);
    state.z_b = 0;

    // Fret crossings in the ROTATING frame.
    const relAngle = wrap2pi(state.theta_b - state.theta_r);
    const idx = Math.floor(relAngle / pocketWidth);
    if (idx !== state._lastFretIndex) {
      state._lastFretIndex = idx;
      // Fret hit: tangential restitution + scatter. Occasionally reverses (hops back).
      const rest = rng.range(cfg.fret.restitution[0], cfg.fret.restitution[1]);
      let relOmega = (state.omega_b - state.omega_r) * rest + rng.jitter(cfg.fret.scatter);
      // Reconstruct ball omega from the (possibly reversed) relative omega.
      state.omega_b = relOmega + state.omega_r;
      state.fretHits += 1;
    }

    // Settle test: relative motion calm and sitting inside a pocket (not on a fret).
    const relOmega = Math.abs(state.omega_b - state.omega_r);
    if (relOmega < cfg.fret.settleRelOmega) {
      state._calmTime += dt;
      if (state._calmTime >= cfg.fret.settleTime) {
        state.phase = PHASE.SETTLED;
        const rel = wrap2pi(state.theta_b - state.theta_r);
        state._settleRel = rel;
        state.pocketIndex = Math.floor(rel / pocketWidth) % N;
        state.winningNumber = layout[state.pocketIndex];
      }
    } else {
      state._calmTime = 0;
    }
    return;
  }
}

// Run a full spin headless (no rendering). Returns a result summary.
export function runSpin(cfg, rng, launchBias = null) {
  const state = createState();
  initSpin(state, cfg, rng, launchBias);
  const maxSteps = Math.ceil(cfg.sim.maxSpinTime / cfg.sim.dt);
  let steps = 0;
  while (state.phase !== PHASE.SETTLED && steps < maxSteps) {
    step(state, cfg, rng);
    steps += 1;
  }
  return {
    winningNumber: state.winningNumber,
    pocketIndex: state.pocketIndex,
    spinDuration: state.t,
    revolutionsBeforeDrop: state.revBeforeDrop,
    deflectorHits: state.deflectorHits,
    fretHits: state.fretHits,
    settled: state.phase === PHASE.SETTLED,
  };
}

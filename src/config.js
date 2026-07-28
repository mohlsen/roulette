// ALL tunable physics + timing constants live here (SI units: metres, seconds, radians).
// The renderer and physics both read from this single object so the debug panel can
// mutate one place and have everything respond.

export const config = {
  mode: 'roulette', // 'roulette' | 'bigwheel'
  wheelType: 'american', // 'american' | 'european' (used when mode === 'roulette')
  bigWheel: {
    spaces: 10, // 2..100 (used when mode === 'bigwheel')
  },

  // --- Geometry (metres) ---------------------------------------------------
  geom: {
    bowlRadius: 0.405, // overall bowl radius (0.81 m diameter, 32" casino wheel)
    trackRadius: 0.36, // ball track radius (banked outer rim of the stationary bowl)
    trackBank: 0.52, // bank angle beta, radians from vertical (~30deg)
    deflectorRadius: 0.32, // radius at which the 8 diamonds sit on the apron
    pocketOuterRadius: 0.28, // outer edge of the pocket ring
    pocketInnerRadius: 0.21, // inner edge (the cone lip / turret base)
    fretHeight: 0.008, // 8 mm
    pocketDepth: 0.01, // 10 mm
    ballRadius: 0.009, // 18 mm ball
    numDeflectors: 8,
  },

  // --- Physical constants --------------------------------------------------
  g: 9.81,

  // --- Rotor deceleration: domega/dt = -(a + b*omega) ---------------------
  rotor: {
    a: 0.0025, // Coulomb term (constant drag)
    b: 0.006, // viscous term (proportional to speed)
    omegaStart: [1.6, 2.6], // rad/s range at launch (~0.25-0.4 rev/s)
  },

  // --- Ball track phase ----------------------------------------------------
  // omega decay while on the banked track: domega/dt = -(a + b*omega)
  ball: {
    trackA: 0.05, // Coulomb-ish rolling term
    trackB: 0.05, // air + rolling viscous term
    omegaStart: [10.5, 12.0], // launch angular speed range (rad/s), opposite sign to rotor
    // Leave-track threshold factor k: departs when omega^2*R < k * g/tan(beta).
    leaveFactor: 1.0,
  },

  // --- Descent / apron phase ----------------------------------------------
  descent: {
    gravitySlide: 0.085, // inward accel along the apron slope (m/s^2); slow spiral across the apron
    radialDamp: 1.6, // damping on radial velocity
    tangentialDrag: 0.9, // extra tangential drag once off the track (1/s)
    // Deflector strike:
    deflectorBand: 0.045, // radial half-width of a diamond's catch zone (m)
    deflectorRestitution: [0.35, 0.7], // fraction of tangential speed retained
    deflectorRadialKick: [0.05, 0.25], // inward radial velocity added on strike (m/s)
    deflectorScatter: 0.6, // random tangential omega scatter (rad/s, +/-)
    deflectorCooldown: 0.06, // min seconds between counted strikes
  },

  // --- Fret / pocket phase -------------------------------------------------
  fret: {
    restitution: [0.4, 0.6], // tangential bounce restitution on a fret hit
    radialRestitution: 0.35,
    drag: 1.15, // continuous decay of RELATIVE omega toward the rotor frame (1/s)
    scatter: 0.25, // random relative-omega scatter on each fret hit (rad/s)
    settleRelOmega: 0.6, // |relative omega| below this (rad/s) counts as calm
    settleTime: 0.35, // must stay calm this long inside a pocket to lock
  },

  // --- Integration ---------------------------------------------------------
  sim: {
    dt: 1 / 240, // fixed physics timestep
    maxFrameDt: 0.1, // clamp accumulated dt per rAF frame
    maxSpinTime: 25, // safety cap (s) so a bad spin can't loop forever
  },

  // Target 10-13 s spin; tune ball drag / omegaStart to hit it.
  targetSpinTime: [10, 13],
};

// Deep clone so the debug panel can reset to defaults.
export function cloneConfig(c = config) {
  return JSON.parse(JSON.stringify(c));
}

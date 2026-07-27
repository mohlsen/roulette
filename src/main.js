// Bootstrap + game loop + phase orchestration. The renderer only READS sim state.
// Fixed-step physics accumulator at 1/240 s, decoupled from requestAnimationFrame.

import { config } from './config.js';
import { createState, initSpin, step, PHASE } from './physics/simulate.js';
import { makeRng, freshSeed } from './physics/rng.js';
import { propsOf } from './data/layouts.js';
import { createScene, fitCamera } from './render/scene.js';
import { createWheel } from './render/wheel.js';
import { createBall } from './render/ball.js';
import { createSession } from './ui/session.js';
import { createDisplay } from './ui/display.js';
import { createHistory } from './ui/history.js';
import { createStats } from './ui/stats.js';
import { createDebug } from './ui/debug.js';

const canvas = document.getElementById('scene');
const hud = document.getElementById('hud');
const spinBtn = document.getElementById('spin');

const { renderer, scene, camera } = createScene(canvas);
const wheel = createWheel(config);
scene.add(wheel.root);
const ball = createBall(config, wheel.surfaceHeight);
scene.add(ball.mesh);

// --- UI + session ----------------------------------------------------------
const session = createSession(config.wheelType);
const display = createDisplay();
createHistory(session);
createStats(session);

// --- Sim state -------------------------------------------------------------
const state = createState();
let rng = makeRng(freshSeed());
let spinning = false;
let idle = true;

// Winning display mirrors the session (also updates after void/reset).
session.onChange((s) => {
  if (!spinning) {
    if (s.history.length) display.show(s.history[0].value);
    else display.clear();
  }
});

let camPush = 0;
let camPushTarget = 0;
let camFocus = 0;
let camFocusTarget = 0;
let focusX = 0; // frozen winning-pocket position the focus zoom looks at
let focusZ = 0;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  fitCamera(camera, w / h);
}
window.addEventListener('resize', resize);
resize();

function startSpin() {
  if (spinning) return;
  requestWakeLock(); // triggered by a user gesture, as iOS requires
  rng = makeRng(freshSeed());
  initSpin(state, config, rng);
  ball.reset(state);
  spinning = true;
  idle = false;
  spinBtn.disabled = true;
  display.clear();
  camPushTarget = 0;
  camFocusTarget = 0; // release focus, zoom back out to the whole wheel
}

function onSettled() {
  spinning = false;
  spinBtn.disabled = false;
  camPushTarget = 0;
  camFocusTarget = 1; // zoom in on the winning pocket and hold
  session.record(state.winningNumber); // -> updates display, history, stats, persists
  display.show(state.winningNumber);
  console.log('Result:', state.winningNumber, propsOf(state.winningNumber));
}

// --- Controls --------------------------------------------------------------
spinBtn.addEventListener('click', startSpin);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    startSpin();
  }
});

document.getElementById('void').addEventListener('click', () => {
  if (spinning) return;
  session.voidLast();
});
document.getElementById('reset').addEventListener('click', () => {
  if (spinning) return;
  if (confirm('Reset the session? This clears all history and stats.')) {
    session.reset();
  }
});

// --- iOS lifecycle: context loss, visibility, wake lock -------------------
let contextLost = false;
let hidden = document.hidden;

canvas.addEventListener(
  'webglcontextlost',
  (e) => {
    e.preventDefault(); // required so the context can be restored
    contextLost = true;
  },
  false,
);
canvas.addEventListener(
  'webglcontextrestored',
  () => {
    contextLost = false;
    last = performance.now(); // avoid a huge catch-up dt
  },
  false,
);

document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (!hidden) {
    last = performance.now(); // resume cleanly, no dt explosion
    requestWakeLock();
  }
});

// Screen wake lock (feature-detected) so the iPad doesn't sleep between spins.
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => {
        wakeLock = null;
      });
    }
  } catch {
    /* denied or unsupported -> ignore */
  }
}

// --- Fixed-step loop -------------------------------------------------------
let last = performance.now();
let acc = 0;
const dt = config.sim.dt;

function frame(now) {
  requestAnimationFrame(frame);
  if (contextLost || hidden) {
    last = now; // hold time steady while paused
    return;
  }
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > config.sim.maxFrameDt) elapsed = config.sim.maxFrameDt;

  if (spinning) {
    acc += elapsed;
    while (acc >= dt) {
      step(state, config, rng);
      acc -= dt;
      if (state.phase === PHASE.DESCENT) camPushTarget = 1;
      if (state.phase === PHASE.SETTLED) {
        onSettled();
        break;
      }
    }
  } else if (!idle) {
    step(state, config, rng); // rotor keeps coasting visibly
  }

  const rdt = Math.min(elapsed, 0.05);
  ball.update(state, rdt);
  wheel.rotorGroup.rotation.y = -state.theta_r;

  // Camera: subtle push-in on the drop, then a deep focus zoom onto the winning
  // pocket that holds and follows the ball as the rotor keeps turning. While
  // holding focus, track the ball; once a spin starts, FREEZE the look point and
  // zoom back out fast so the view doesn't chase the now-fast ball and spin out.
  camPush += (camPushTarget - camPush) * Math.min(1, 2.2 * elapsed);
  if (camFocusTarget === 1) {
    focusX = ball.mesh.position.x;
    focusZ = ball.mesh.position.z;
  }
  const focusRate = camFocusTarget >= camFocus ? 1.6 : 7.0; // slow in, fast out
  camFocus += (camFocusTarget - camFocus) * Math.min(1, focusRate * elapsed);
  fitCamera(camera, window.innerWidth / window.innerHeight, {
    push: camPush,
    focus: camFocus,
    ballX: focusX,
    ballZ: focusZ,
  });

  hud.textContent =
    `${config.wheelType} ${phaseName(state.phase)} r:${state.r_b.toFixed(3)} ` +
    `rev:${state.revBeforeDrop.toFixed(1)} def:${state.deflectorHits} fret:${state.fretHits} t:${state.t.toFixed(1)}s`;

  renderer.render(scene, camera);
}

function phaseName(p) {
  return ['track', 'descent', 'fret', 'settled'][p] ?? 'idle';
}

// Rest state before the first spin.
initSpin(state, config, rng);
state.phase = -1;
ball.reset(state);
ball.update(state, 0);
requestAnimationFrame(frame);

// Run one spin to its result without waiting for real time (used by the debug
// panel's "force spins" button and the dev hook).
function fastForwardOnce() {
  if (!spinning) startSpin();
  let guard = 0;
  while (state.phase !== PHASE.SETTLED && guard < 240 * config.sim.maxSpinTime) {
    step(state, config, rng);
    guard++;
  }
  onSettled();
  return state.winningNumber;
}

// --- Debug panel (triple-tap top-left corner) ------------------------------
createDebug({
  getState: () => state,
  forceSpins: (n) => {
    for (let i = 0; i < n; i++) fastForwardOnce();
  },
});

// --- Dev/debug hook --------------------------------------------------------
window.__game = {
  get state() {
    return state;
  },
  config,
  session,
  startSpin,
  fastForward: () => ({ winningNumber: fastForwardOnce() }),
};

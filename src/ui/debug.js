// Debug panel, hidden behind a triple-tap in the top-left corner (or the "d" key
// on desktop). Live physics-constant sliders, a state readout, the headless
// fairness batch (10k spins -> histogram + chi-square), and a force-spins button.
// All tuning is live: sliders mutate the shared `config` object the sim reads.

import { config } from '../config.js';
import { batch } from '../physics/fairness.js';
import { PHASE } from '../physics/simulate.js';

// [path, label, min, max, step]. Numeric path segments index into arrays.
const SLIDERS = [
  ['rotor.a', 'rotor Coulomb', 0, 0.02, 0.0005],
  ['rotor.b', 'rotor viscous', 0, 0.03, 0.001],
  ['rotor.omegaStart.0', 'rotor ω min', 0.5, 4, 0.1],
  ['rotor.omegaStart.1', 'rotor ω max', 0.5, 4, 0.1],
  ['ball.omegaStart.0', 'ball ω min', 6, 18, 0.1],
  ['ball.omegaStart.1', 'ball ω max', 6, 18, 0.1],
  ['ball.trackA', 'track Coulomb', 0, 0.2, 0.005],
  ['ball.trackB', 'track viscous', 0, 0.2, 0.005],
  ['ball.leaveFactor', 'leave factor', 0.5, 1.5, 0.02],
  ['descent.gravitySlide', 'apron slide', 0.02, 0.5, 0.01],
  ['descent.tangentialDrag', 'descent drag', 0.2, 2, 0.05],
  ['descent.deflectorRestitution.0', 'deflector rest min', 0.1, 1, 0.02],
  ['descent.deflectorRestitution.1', 'deflector rest max', 0.1, 1, 0.02],
  ['fret.restitution.0', 'fret rest min', 0.1, 0.9, 0.02],
  ['fret.restitution.1', 'fret rest max', 0.1, 0.9, 0.02],
  ['fret.drag', 'fret drag', 0.5, 4, 0.05],
  ['fret.settleRelOmega', 'settle ω', 0.2, 1.5, 0.05],
];

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o[k], obj);
}
function setPath(obj, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  const t = keys.reduce((o, k) => o[k], obj);
  t[last] = v;
}

export function createDebug({ getState, forceSpins }) {
  injectStyles();

  // Triple-tap hotspot.
  const zone = el('div', 'dbg-zone');
  document.body.appendChild(zone);

  const panel = el('div', 'dbg-panel');
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="dbg-head">
      <strong>Debug</strong>
      <button class="dbg-x" aria-label="close">✕</button>
    </div>
    <pre class="dbg-state"></pre>
    <div class="dbg-actions">
      <button class="dbg-btn" data-act="fair">Run 10,000 spins</button>
      <button class="dbg-btn" data-act="force">Force 20 spins</button>
      <button class="dbg-btn" data-act="reset">Reset constants</button>
    </div>
    <div class="dbg-result"></div>
    <div class="dbg-sliders"></div>
  `;
  document.body.appendChild(panel);

  const stateEl = panel.querySelector('.dbg-state');
  const resultEl = panel.querySelector('.dbg-result');
  const slidersEl = panel.querySelector('.dbg-sliders');

  // Build sliders.
  const defaults = JSON.parse(JSON.stringify(config));
  const rows = SLIDERS.map(([path, label, min, max, stepv]) => {
    const row = el('label', 'dbg-slider');
    const val = el('span', 'dbg-val');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = stepv;
    input.value = getPath(config, path);
    val.textContent = (+input.value).toFixed(3);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      setPath(config, path, v);
      val.textContent = v.toFixed(3);
    });
    row.append(labelSpan(label), input, val);
    slidersEl.appendChild(row);
    return { path, input, val };
  });

  function syncSliders() {
    for (const r of rows) {
      r.input.value = getPath(config, r.path);
      r.val.textContent = (+r.input.value).toFixed(3);
    }
  }

  // Live state readout.
  let readoutTimer = null;
  function refreshState() {
    const s = getState();
    const name = ['track', 'descent', 'fret', 'settled'][s.phase] ?? 'idle';
    stateEl.textContent =
      `phase   ${name}\n` +
      `t       ${s.t.toFixed(2)} s\n` +
      `ω_rotor ${s.omega_r.toFixed(2)}   ω_ball ${s.omega_b.toFixed(2)}\n` +
      `r_ball  ${s.r_b.toFixed(3)} m\n` +
      `revs    ${s.revBeforeDrop.toFixed(1)}\n` +
      `hits    deflector ${s.deflectorHits}   fret ${s.fretHits}\n` +
      `result  ${s.winningNumber ?? '—'}`;
  }

  function open() {
    panel.style.display = 'block';
    syncSliders();
    refreshState();
    readoutTimer = setInterval(refreshState, 100);
  }
  function close() {
    panel.style.display = 'none';
    if (readoutTimer) clearInterval(readoutTimer);
    readoutTimer = null;
  }
  function toggle() {
    panel.style.display === 'none' ? open() : close();
  }

  // Triple-tap detection.
  let taps = 0;
  let tapTimer = null;
  zone.addEventListener('pointerdown', () => {
    taps++;
    clearTimeout(tapTimer);
    if (taps >= 3) {
      taps = 0;
      toggle();
    } else {
      tapTimer = setTimeout(() => (taps = 0), 500);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'd' && !e.metaKey && !e.ctrlKey) toggle();
  });

  panel.querySelector('.dbg-x').addEventListener('click', close);
  panel.querySelector('[data-act="reset"]').addEventListener('click', () => {
    // Restore defaults into the live config in place.
    deepAssign(config, defaults);
    syncSliders();
  });
  panel.querySelector('[data-act="force"]').addEventListener('click', () => {
    forceSpins(20);
  });
  panel.querySelector('[data-act="fair"]').addEventListener('click', (e) => {
    const btn = e.target;
    btn.disabled = true;
    resultEl.textContent = 'Running 10,000 spins…';
    // Defer so the label paints before the (blocking) batch. setTimeout rather
    // than rAF so it fires even when rAF is throttled (backgrounded tab).
    setTimeout(() => {
      const t0 = performance.now();
      const res = batch(config, 10000);
      const ms = performance.now() - t0;
      renderFairness(resultEl, res, ms);
      btn.disabled = false;
    }, 40);
  });

  return { open, close, toggle };
}

function renderFairness(root, res, ms) {
  const exp = res.ok / res.layout.length;
  const max = Math.max(...res.counts);
  const verdict = res.pass
    ? '<span style="color:#25c268">PASS · flat</span>'
    : '<span style="color:#e23b3b">FAIL · biased</span>';
  const head =
    `<div class="dbg-fair-head">` +
    `χ² ${res.chiSquare.toFixed(1)} / crit ${res.critical95.toFixed(1)} (dof ${res.dof}) — ${verdict}<br>` +
    `${res.ok} spins · ${ms.toFixed(0)} ms · dur avg ${res.avgDuration.toFixed(1)}s · ` +
    `revs ${res.avgRevolutions.toFixed(1)} · defl ${res.avgDeflectorHits.toFixed(1)} · fret ${res.avgFretHits.toFixed(1)}` +
    `</div>`;
  const bars = res.layout
    .map((num, i) => {
      const c = res.counts[i];
      const pct = (c / max) * 100;
      const dev = (((c - exp) / exp) * 100).toFixed(0);
      return `<div class="dbg-bar"><span class="dbg-bar-n">${num}</span>
        <span class="dbg-bar-track"><span class="dbg-bar-fill" style="width:${pct}%"></span></span>
        <span class="dbg-bar-c">${c} ${dev >= 0 ? '+' : ''}${dev}%</span></div>`;
    })
    .join('');
  root.innerHTML = head + `<div class="dbg-hist">${bars}</div>`;
}

// --- tiny DOM helpers ------------------------------------------------------
function el(tag, cls) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
function labelSpan(text) {
  const s = document.createElement('span');
  s.className = 'dbg-label';
  s.textContent = text;
  return s;
}
function deepAssign(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object') deepAssign(target[k], src[k]);
    else target[k] = src[k];
  }
}

function injectStyles() {
  if (document.getElementById('dbg-style')) return;
  const s = document.createElement('style');
  s.id = 'dbg-style';
  s.textContent = `
    .dbg-zone{position:fixed;top:0;left:0;width:76px;height:76px;z-index:50}
    .dbg-panel{position:fixed;top:10px;left:10px;width:min(360px,42vw);max-height:94vh;overflow-y:auto;
      z-index:60;background:rgba(8,8,12,0.96);border:1px solid rgba(255,255,255,0.14);border-radius:14px;
      padding:12px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#d7d9de;
      -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
    .dbg-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    .dbg-x{background:none;border:none;color:#9aa0a6;font-size:16px;cursor:pointer}
    .dbg-state{margin:0 0 10px;line-height:1.5;white-space:pre-wrap;color:#aeb3ba}
    .dbg-actions{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
    .dbg-btn{flex:1 1 auto;background:#e8c66a;color:#1a1205;border:none;border-radius:8px;padding:8px;
      font-weight:700;font-size:11px;cursor:pointer}
    .dbg-btn:disabled{opacity:.5}
    .dbg-result{margin-bottom:8px}
    .dbg-fair-head{margin-bottom:6px;line-height:1.5}
    .dbg-hist{max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
    .dbg-bar{display:flex;align-items:center;gap:6px}
    .dbg-bar-n{width:26px;text-align:right;color:#9aa0a6}
    .dbg-bar-track{flex:1;height:9px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden}
    .dbg-bar-fill{display:block;height:100%;background:#e8c66a}
    .dbg-bar-c{width:78px;text-align:right;color:#8a9098}
    .dbg-slider{display:grid;grid-template-columns:1fr 1.2fr auto;align-items:center;gap:8px;margin:5px 0}
    .dbg-label{color:#9aa0a6}
    .dbg-val{width:52px;text-align:right;color:#e8c66a}
    input[type=range]{width:100%}
  `;
  document.head.appendChild(s);
}

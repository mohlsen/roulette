// Headless batch + fairness statistics. No rendering, no three.js — importable by
// both the Node CLI and the in-browser debug panel.

import { runSpin } from './simulate.js';
import { makeRng, freshSeed } from './rng.js';
import { getLayout } from '../data/layouts.js';

// Run N spins and collect per-pocket counts + spin metrics.
export function batch(cfg, n, seed = freshSeed()) {
  const rng = makeRng(seed);
  const layout = getLayout(cfg.wheelType);
  const N = layout.length;
  const counts = new Array(N).fill(0);

  let durSum = 0;
  let durMin = Infinity;
  let durMax = -Infinity;
  let revSum = 0;
  let defSum = 0;
  let fretSum = 0;
  let failed = 0;

  for (let i = 0; i < n; i++) {
    const res = runSpin(cfg, rng);
    if (!res.settled || res.pocketIndex < 0) {
      failed += 1;
      continue;
    }
    counts[res.pocketIndex] += 1;
    durSum += res.spinDuration;
    durMin = Math.min(durMin, res.spinDuration);
    durMax = Math.max(durMax, res.spinDuration);
    revSum += res.revolutionsBeforeDrop;
    defSum += res.deflectorHits;
    fretSum += res.fretHits;
  }

  const ok = n - failed;
  const chi = chiSquareUniform(counts, ok);
  return {
    n,
    ok,
    failed,
    counts,
    layout,
    chiSquare: chi.chi2,
    dof: chi.dof,
    critical95: chi.critical95,
    pass: chi.chi2 <= chi.critical95,
    avgDuration: durSum / ok,
    minDuration: durMin,
    maxDuration: durMax,
    avgRevolutions: revSum / ok,
    avgDeflectorHits: defSum / ok,
    avgFretHits: fretSum / ok,
  };
}

// Pearson chi-square against a uniform expectation.
export function chiSquareUniform(counts, total) {
  const k = counts.length;
  const expected = total / k;
  let chi2 = 0;
  for (let i = 0; i < k; i++) {
    const d = counts[i] - expected;
    chi2 += (d * d) / expected;
  }
  const dof = k - 1;
  return { chi2, dof, critical95: chiSquareCritical95(dof) };
}

// 95th-percentile critical value of the chi-square distribution.
// Wilson–Hilferty approximation — good to a few tenths of a percent for dof >= 30.
function chiSquareCritical95(dof) {
  const z = 1.6448536269514722; // 95th percentile of the standard normal
  const t = 1 - 2 / (9 * dof) + z * Math.sqrt(2 / (9 * dof));
  return dof * t * t * t;
}

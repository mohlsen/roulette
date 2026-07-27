// CLI entry for phase 1: run a single verbose spin, or the 10k fairness batch.
//   node src/physics/headless.js            -> a few sample spins, verbose
//   node src/physics/headless.js --fairness  -> 10,000-spin distribution + chi-square
//   node src/physics/headless.js --fairness 50000 --seed 123

import { config } from '../config.js';
import { runSpin } from './simulate.js';
import { makeRng, freshSeed } from './rng.js';
import { batch } from './fairness.js';

const args = process.argv.slice(2);
const fairness = args.includes('--fairness');
const seedArg = args.indexOf('--seed');
const seed = seedArg >= 0 ? Number(args[seedArg + 1]) >>> 0 : freshSeed();

function fmt(n, d = 2) {
  return Number(n).toFixed(d);
}

if (!fairness) {
  // A handful of verbose sample spins.
  const rng = makeRng(seed);
  const samples = 8;
  console.log(`\nSample spins (seed ${seed}, ${config.wheelType}):\n`);
  for (let i = 0; i < samples; i++) {
    const r = runSpin(config, rng);
    console.log(
      `  #${i + 1}  win=${String(r.winningNumber).padStart(2)}  ` +
        `dur=${fmt(r.spinDuration)}s  revs=${fmt(r.revolutionsBeforeDrop, 1)}  ` +
        `deflectors=${r.deflectorHits}  frets=${r.fretHits}` +
        (r.settled ? '' : '  [DID NOT SETTLE]'),
    );
  }
  console.log('');
} else {
  const nArg = args.find((a) => /^\d+$/.test(a));
  const n = nArg ? Number(nArg) : 10000;
  const t0 = performance.now();
  const res = batch(config, n, seed);
  const ms = performance.now() - t0;

  console.log(`\nFairness batch: ${res.ok}/${n} spins settled (seed ${seed}, ${config.wheelType})`);
  console.log(`Elapsed: ${fmt(ms, 0)} ms  (${fmt(ms / n, 3)} ms/spin)`);
  if (res.failed) console.log(`WARNING: ${res.failed} spins failed to settle within maxSpinTime`);

  console.log(
    `\nDurations: avg ${fmt(res.avgDuration)}s  min ${fmt(res.minDuration)}s  max ${fmt(res.maxDuration)}s`,
  );
  console.log(
    `Revs before drop: avg ${fmt(res.avgRevolutions, 1)}   ` +
      `Deflector hits: avg ${fmt(res.avgDeflectorHits, 1)}   Fret hits: avg ${fmt(res.avgFretHits, 1)}`,
  );

  // Chi-square verdict
  console.log(
    `\nChi-square vs uniform: ${fmt(res.chiSquare, 1)}  ` +
      `(dof ${res.dof}, 95% critical ${fmt(res.critical95, 1)})  -> ${res.pass ? 'PASS (flat)' : 'FAIL (biased)'}`,
  );

  // ASCII histogram in wheel order.
  const expected = res.ok / res.layout.length;
  const maxCount = Math.max(...res.counts);
  const barW = 40;
  console.log(`\nDistribution (expected ~${fmt(expected, 0)} per pocket):`);
  res.layout.forEach((num, i) => {
    const c = res.counts[i];
    const bars = Math.round((c / maxCount) * barW);
    const dev = ((c - expected) / expected) * 100;
    console.log(
      `  ${String(num).padStart(3)} | ${'#'.repeat(bars).padEnd(barW)} ${String(c).padStart(5)}  ${dev >= 0 ? '+' : ''}${fmt(dev, 0)}%`,
    );
  });
  console.log('');
}

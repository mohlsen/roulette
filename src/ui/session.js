// Session state: history + derived stats, persisted to localStorage after every
// spin. Wrapped in try/catch with an in-memory fallback (private browsing throws).

import { propsOf, getActiveLayout } from '../data/layouts.js';

const KEY = 'roulette.session.v1';

// `config` is the shared, mutable config object — read fresh on every stats()
// call so a mode/space-count change (which resets the session) is reflected
// immediately without needing to recreate this module.
export function createSession(config) {
  let history = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* private browsing / disabled storage -> in-memory */
    }
    return [];
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(history.slice(0, 500)));
    } catch {
      /* ignore -> stays in memory only */
    }
  }

  function notify() {
    for (const fn of listeners) fn(api);
  }

  const api = {
    get history() {
      return history;
    },
    onChange(fn) {
      listeners.add(fn);
      fn(api);
      return () => listeners.delete(fn);
    },
    record(value) {
      history.unshift({ value });
      persist();
      notify();
    },
    voidLast() {
      if (history.length) {
        history.shift();
        persist();
        notify();
      }
    },
    reset() {
      history = [];
      persist();
      notify();
    },
    stats() {
      return computeStats(history, getActiveLayout(config).values, config.mode);
    },
  };
  return api;
}

function computeStats(history, layout, mode) {
  const s = {
    total: history.length,
    red: 0,
    black: 0,
    green: 0,
    odd: 0,
    even: 0,
    low: 0,
    high: 0,
    dozen: [0, 0, 0],
    counts: new Map(),
  };
  for (const h of history) {
    s.counts.set(h.value, (s.counts.get(h.value) || 0) + 1);
    if (mode !== 'bigwheel') {
      // Colour/parity/dozen/column only carry meaning in roulette mode — a Big
      // Wheel spin is just a number, so skip these entirely there.
      const p = propsOf(h.value);
      if (p.color === 'red') s.red++;
      else if (p.color === 'black') s.black++;
      else s.green++;
      if (p.parity === 'odd') s.odd++;
      else if (p.parity === 'even') s.even++;
      if (p.range === 'low') s.low++;
      else if (p.range === 'high') s.high++;
      if (p.dozen) s.dozen[p.dozen - 1]++;
    }
  }

  // Hot / cold across all pockets (unseen numbers count as 0 -> coldest).
  // Generic to any layout, so it works the same for roulette and Big Wheel.
  const freq = layout.map((v) => ({ value: v, n: s.counts.get(v) || 0 }));
  const hot = [...freq].sort((a, b) => b.n - a.n).filter((f) => f.n > 0).slice(0, 4);
  const cold = [...freq].sort((a, b) => a.n - b.n).slice(0, 4);
  s.hot = hot;
  s.cold = cold;
  return s;
}

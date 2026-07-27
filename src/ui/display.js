// Winning-number box (upper-right). Shows the number, colour-matched, plus its
// properties as chips.

import { propsOf } from '../data/layouts.js';

const COLOR_HEX = { red: '#e23b3b', green: '#25c268', black: '#f4efe4' };
const BORDER_HEX = {
  red: 'rgba(226,59,59,0.7)',
  green: 'rgba(37,194,104,0.7)',
  black: 'rgba(255,255,255,0.28)',
};
const GLOW = {
  red: '0 0 40px rgba(226,59,59,0.25)',
  green: '0 0 40px rgba(37,194,104,0.25)',
  black: '0 0 40px rgba(255,255,255,0.12)',
};

export function createDisplay() {
  const box = document.getElementById('result-box');
  const numEl = document.getElementById('result-num');
  const propsEl = document.getElementById('result-props');

  function clear() {
    numEl.textContent = '–';
    numEl.style.color = 'var(--ink)';
    propsEl.innerHTML = '';
    box.style.borderColor = 'var(--tile-line)';
    box.style.boxShadow = 'none';
  }

  function show(value) {
    const p = propsOf(value);
    numEl.textContent = String(value);
    numEl.style.color = COLOR_HEX[p.color];
    box.style.borderColor = BORDER_HEX[p.color];
    box.style.boxShadow = GLOW[p.color];

    const chips = [];
    if (p.parity === null) {
      chips.push(p.color.toUpperCase()); // 0 / 00
    } else {
      chips.push(p.color.toUpperCase());
      chips.push(p.parity.toUpperCase());
      chips.push(p.range === 'low' ? '1–18' : '19–36');
      chips.push(`${ordinal(p.dozen)} 12`);
      chips.push(`Col ${p.column}`);
    }
    propsEl.innerHTML = chips.map((c) => `<span class="chip">${c}</span>`).join('');
  }

  return { show, clear };
}

function ordinal(n) {
  return ['1st', '2nd', '3rd'][n - 1] ?? `${n}th`;
}

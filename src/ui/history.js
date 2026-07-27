// Last-20 history billboard: newest on top, colour-coded, mirroring a real LED
// table display. Renders from the session on every change.

import { propsOf } from '../data/layouts.js';

const MAX_SHOWN = 20;
const BG_CLASS = { red: 'red-bg', green: 'green-bg', black: 'black-bg' };

export function createHistory(session) {
  const list = document.getElementById('history-list');

  function render(s) {
    const items = s.history.slice(0, MAX_SHOWN);
    if (items.length === 0) {
      list.innerHTML = '<div class="hmeta" style="padding:8px">No spins yet.</div>';
      return;
    }
    list.innerHTML = items
      .map((h) => {
        const p = propsOf(h.value);
        const meta =
          p.parity === null
            ? p.color.toUpperCase()
            : `${p.color[0].toUpperCase()} · ${p.parity === 'odd' ? 'Odd' : 'Even'} · ${
                p.range === 'low' ? '1–18' : '19–36'
              }`;
        return `<div class="hrow">
            <span class="hnum ${BG_CLASS[h.color]}">${h.value}</span>
            <span class="hmeta">${meta}</span>
          </div>`;
      })
      .join('');
  }

  session.onChange(render);
  return { render };
}

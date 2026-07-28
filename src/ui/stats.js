// Collapsible session stats panel. Big Wheel mode drops every roulette-only
// category (color/parity/range/dozens) since only the number matters there.

export function createStats(session, config) {
  const box = document.getElementById('stats-box');
  const toggle = document.getElementById('stats-toggle');
  const caret = document.getElementById('stats-caret');
  const body = document.getElementById('stats-body');

  toggle.addEventListener('click', () => {
    box.classList.toggle('collapsed');
    caret.textContent = box.classList.contains('collapsed') ? '▸' : '▾';
  });

  function render() {
    const s = session.stats();
    const fmt = (v) => v.map((f) => f.value).join(' ');

    if (config.mode === 'bigwheel') {
      body.innerHTML = `
        ${statWide('Spins', s.total)}
        ${statWide('Hot', s.total ? fmt(s.hot) : '—')}
        ${statWide('Cold', s.total ? fmt(s.cold) : '—')}
      `;
      return;
    }

    const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);
    body.innerHTML = `
      ${stat('Spins', s.total)}
      ${stat('Green', `${s.green}`)}
      ${stat('Red', `${s.red} · ${pct(s.red)}%`)}
      ${stat('Black', `${s.black} · ${pct(s.black)}%`)}
      ${stat('Odd', `${s.odd} · ${pct(s.odd)}%`)}
      ${stat('Even', `${s.even} · ${pct(s.even)}%`)}
      ${stat('1–18', `${s.low} · ${pct(s.low)}%`)}
      ${stat('19–36', `${s.high} · ${pct(s.high)}%`)}
      ${statWide('Dozens', `${s.dozen[0]} / ${s.dozen[1]} / ${s.dozen[2]}`)}
      ${statWide('Hot', s.total ? fmt(s.hot) : '—')}
      ${statWide('Cold', s.total ? fmt(s.cold) : '—')}
    `;
  }

  session.onChange(render);
  return { render };
}

function stat(label, value) {
  return `<div class="stat"><span>${label}</span><span>${value}</span></div>`;
}
function statWide(label, value) {
  return `<div class="stat wide"><span>${label}</span><span>${value}</span></div>`;
}

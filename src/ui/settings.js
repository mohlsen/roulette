// Wheel-mode settings: Roulette (American/European) vs Big Wheel (2..100
// spaces). Persisted separately from session history so a mid-event refresh
// restores the mode the host had configured, not just the roulette default.

const STORE_KEY = 'roulette.settings.v1';

export function loadPersistedSettings(config) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.mode === 'roulette' || s.mode === 'bigwheel') config.mode = s.mode;
    if (s.wheelType === 'american' || s.wheelType === 'european') config.wheelType = s.wheelType;
    if (Number.isInteger(s.spaces) && s.spaces >= 2 && s.spaces <= 100) config.bigWheel.spaces = s.spaces;
  } catch {
    /* private browsing / disabled storage -> defaults */
  }
}

function persist(config) {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ mode: config.mode, wheelType: config.wheelType, spaces: config.bigWheel.spaces }),
    );
  } catch {
    /* ignore -> stays in memory only */
  }
}

export function createSettingsPanel({ config, isSpinning, onApply }) {
  const btn = document.getElementById('settings-btn');
  const overlay = document.getElementById('settings-overlay');
  const modeSeg = document.getElementById('mode-seg');
  const wheelTypeSeg = document.getElementById('wheeltype-seg');
  const rouletteOpts = document.getElementById('roulette-opts');
  const bigwheelOpts = document.getElementById('bigwheel-opts');
  const spacesInput = document.getElementById('spaces-input');
  const applyBtn = document.getElementById('settings-apply');
  const cancelBtn = document.getElementById('settings-cancel');

  let draftMode = config.mode;
  let draftWheelType = config.wheelType;

  function updateSegs() {
    for (const b of modeSeg.children) b.classList.toggle('active', b.dataset.mode === draftMode);
    for (const b of wheelTypeSeg.children) b.classList.toggle('active', b.dataset.wheeltype === draftWheelType);
    rouletteOpts.classList.toggle('hidden', draftMode !== 'roulette');
    bigwheelOpts.classList.toggle('hidden', draftMode !== 'bigwheel');
  }

  function syncFromConfig() {
    draftMode = config.mode;
    draftWheelType = config.wheelType;
    spacesInput.value = config.bigWheel.spaces;
    updateSegs();
  }

  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    draftMode = b.dataset.mode;
    updateSegs();
  });
  wheelTypeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    draftWheelType = b.dataset.wheeltype;
    updateSegs();
  });

  function open() {
    if (isSpinning()) return;
    syncFromConfig();
    overlay.classList.remove('hidden');
  }
  function close() {
    overlay.classList.add('hidden');
  }

  btn.addEventListener('click', open);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  applyBtn.addEventListener('click', () => {
    let spaces = parseInt(spacesInput.value, 10);
    if (!Number.isFinite(spaces)) spaces = config.bigWheel.spaces;
    spaces = Math.max(2, Math.min(100, Math.round(spaces)));
    spacesInput.value = spaces;

    config.mode = draftMode;
    config.wheelType = draftWheelType;
    config.bigWheel.spaces = spaces;
    persist(config);
    close();
    onApply();
  });

  return { open, close };
}

// Pocket orders, colors, and number properties.
// Pocket orders are copied verbatim from the brief — DO NOT regenerate them.

// European, clockwise from 0 (37 pockets)
export const EUROPEAN = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

// American, clockwise from 0 (38 pockets)
export const AMERICAN = [
  '0', 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00',
  27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2,
];

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BLACK = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);

export function getLayout(type = 'european') {
  return type === 'american' ? AMERICAN : EUROPEAN;
}

// Color for a pocket value (number or the strings '0'/'00').
export function colorOf(value) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (value === '0' || value === '00' || n === 0) return 'green';
  if (RED.has(n)) return 'red';
  if (BLACK.has(n)) return 'black';
  return 'green';
}

// Derived properties of a winning number, for the display panel.
export function propsOf(value) {
  const isZero = value === '0' || value === '00' || value === 0;
  const n = typeof value === 'string' ? Number(value) : value;
  const color = colorOf(value);
  if (isZero) {
    return {
      value,
      color,
      parity: null,
      range: null, // low (1-18) / high (19-36)
      dozen: null, // 1..3
      column: null, // 1..3
    };
  }
  return {
    value: n,
    color,
    parity: n % 2 === 0 ? 'even' : 'odd',
    range: n <= 18 ? 'low' : 'high',
    dozen: n <= 12 ? 1 : n <= 24 ? 2 : 3,
    column: ((n - 1) % 3) + 1,
  };
}

// --- Big Wheel mode --------------------------------------------------------
// A configurable N-space wheel (2..100), numbered 1..N sequentially. Only the
// number matters here — no parity/color/dozen meaning. Colors are purely
// decorative: greedily assigned from a 3-color palette so no two adjacent
// segments share a color, INCLUDING the wrap-around from the last space back
// to the first (a plain 2-color alternation can't do this when N is odd —
// that's an odd cycle, which needs a 3rd color to break the seam).
const BIG_WHEEL_PALETTE = ['red', 'black', 'green'];

export function bigWheelValues(n) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function bigWheelColorKeys(n) {
  const keys = [];
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const prev = keys[i - 1];
    const first = keys[0];
    const pick = BIG_WHEEL_PALETTE.find((c) => c !== prev && !(isLast && c === first));
    keys.push(pick ?? BIG_WHEEL_PALETTE[0]);
  }
  return keys;
}

// Unified pocket data for whichever mode is active. Both physics (which only
// needs `values` + its length) and the renderer (which also needs a color per
// index) read the wheel through this single function.
export function getActiveLayout(config) {
  if (config.mode === 'bigwheel') {
    const n = config.bigWheel.spaces;
    return { values: bigWheelValues(n), colorKeys: bigWheelColorKeys(n) };
  }
  const values = getLayout(config.wheelType);
  return { values, colorKeys: values.map(colorOf) };
}

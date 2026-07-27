# Roulette

A physics-based roulette wheel for casino night. Stand it up on an iPad in
landscape, tap **SPIN**, and watch the ball settle into a pocket — the winning
number is an emergent result of a real cylindrical-coordinate physics
simulation, never a value the animation is choreographed toward.

No accounts, no backend, no betting engine — it's a wheel, not a casino. Pair
it with a real layout mat and chips and pay out by hand.

## How it works

The simulation (`src/physics/`) is written in plain JS with zero three.js
imports, so it runs headlessly in Node as well as in the browser. It models a
ball on a banked track that decays, drops across deflectors on the apron, and
hops between frets on the spinning rotor before settling — friction, gravity,
restitution, and scatter, in real SI units. The renderer (`src/render/`) only
*reads* that state each frame; it never influences the outcome.

Fairness comes from the launch conditions being uniformly randomized
(`crypto.getRandomValues`-seeded), not from tuning the bounce physics to
produce a flat histogram after the fact.

## Requirements

- Node 18+

## Development

```bash
npm install
npm run dev       # start the Vite dev server
```

## Physics-only tools (no browser required)

```bash
npm run physics    # print a few sample spins with full telemetry
npm run fairness   # run a 10,000-spin batch, print a histogram + chi-square test
```

## Build

```bash
npm run build      # outputs static files to dist/
npm run preview    # serve the production build locally
```

The build is fully static (`index.html` + `assets/`) with relative paths
(`base: './'` in `vite.config.js`), so it works from any subdirectory — no
server-side runtime or environment variables required.

## Deploying to GitHub Pages

`dist/` is a build artifact and isn't committed. Pushing to `main` triggers
`.github/workflows/deploy.yml`, which builds the project and publishes it via
GitHub's Pages Actions deployment.

One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**.

## iPad / installable app

The app is installable to the home screen (`manifest.webmanifest` +
`apple-touch-icon`) and launches fullscreen with no browser chrome. It handles
`webglcontextlost`/`visibilitychange` (iOS drops the WebGL context when
backgrounded) and requests a screen wake lock during a spin so the iPad
doesn't sleep mid-session.

## Debug panel

Triple-tap the top-left corner (or press `d` on desktop) to open the debug
panel: live physics-constant sliders, a state readout, and the "Run 10,000
spins" fairness tool with histogram + chi-square verdict.

## License

MIT — see [LICENSE](LICENSE).

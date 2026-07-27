# Agent Brief: Physics-Based Roulette Wheel (Static Web App for iPad)

> Paste this whole document to your coding agent as the opening message. Work through it phase by
> phase — do not skip ahead. Stop at the end of each phase and report before continuing.

---

## 1. What I'm building and why

I run a casual casino-night event. I already own a physical roulette **layout mat and chips**, so
players place real bets and I pay them out by hand. What I don't have is a wheel.

I want a web app that acts as the wheel: I stand it up on an **iPad in landscape**, the dealer
launches the ball with a swipe, everyone watches it spin and rattle into a pocket, and the winning
number goes up on a big display with the recent-spin history beside it — exactly like the LED
billboard on a real table.

This is for fun. No accounts, no backend, no betting engine, no payout math, no test suite.

## 2. Hard constraints

- **Static site.** The build output must be plain `index.html` + `assets/`, deployable by copying a
  folder to any web server or S3 bucket. No server-side runtime, no API calls at runtime, no
  environment variables.
- **Must work from a subdirectory** (e.g. `https://myserver/roulette/`). If you use Vite, set
  `base: './'` and verify all asset paths are relative.
- **iOS Safari on iPad is the only target that matters.** Desktop Chrome should work for
  development, but every layout and input decision is made for a 10–13" tablet in landscape.
- **Offline-capable after first load** is a nice-to-have, since event wifi is unreliable. Bundle all
  assets locally; no CDN fetches at runtime.
- **Vanilla JS or TypeScript + three.js.** No React, no heavy framework. Keep the dependency list to
  three.js and (optionally) a physics library.

## 3. The non-negotiable core requirement: real physics

The winning number **must be an emergent result of a simulation**, not a predetermined value that
the animation is then choreographed toward.

Explicitly forbidden:

- Picking the result with `Math.random()` and easing the ball to that pocket.
- Any code path where the winning pocket is known before the ball has physically settled.
- Snapping, magnetism, or correction toward a chosen pocket.

The correct data flow is: **randomize the initial conditions → integrate the simulation → read which
pocket the ball ended up in.** Randomness enters only at launch (and in the microscopic scatter of
bounces), never at the outcome.

### 3.1 Recommended physics approach

Do **not** reach for a full 3D rigid-body engine as your first move. A general solver
(cannon-es/rapier/ammo) fighting a thin ball, tall frets, and a rotating reference frame will give
you tunneling, ball-flies-off-the-table, and ball-balanced-on-a-fret bugs, and it will eat your whole
budget on tuning.

Instead build a **reduced-order model in cylindrical coordinates** (θ, r, z) as the source of truth,
and use three.js purely to render its state. This is what serious roulette simulators do. It is
still genuine physics — friction, gravity, centripetal force, restitution, energy loss — just
expressed in the coordinate system the problem actually lives in.

Use **real SI units and realistic dimensions.** Do not work in arbitrary "wheel units"; the physics
constants stop making sense.

**State:**

| Body | State variables |
| --- | --- |
| Rotor (the spinning inner wheel with the pockets) | `theta_r`, `omega_r` |
| Ball | `theta_b`, `omega_b`, `r_b`, `z_b`, `vr_b`, `vz_b` |

Rotor and ball spin in **opposite** directions.

**Rotor deceleration:** combined Coulomb + viscous drag, `domega/dt = -(a + b * omega_r)`. Tune so a
launch spin coasts for well over a minute — the rotor should still be visibly turning after the ball
settles.

**Ball phases:**

1. **Launch.** Ball is placed on the outer ball track (the banked rim of the stationary bowl) at
   `r = R_track` with a large `omega_b`. Starting angle and speed come from the dealer's swipe plus
   jitter.
2. **Track phase.** `omega_b` decays from rolling friction and air drag. While centripetal
   acceleration is high enough, the banked track holds the ball at constant radius. Leave-track
   condition: the ball departs when `omega_b^2 * R_track` drops below roughly `g / tan(beta)` for
   the track's bank angle `beta`. Treat that threshold as a tunable constant; in practice the ball
   should complete **8–15 revolutions** before dropping.
3. **Descent / deflector phase.** The ball spirals inward and downward across the apron. Place
   **8 deflectors ("diamonds")** at fixed angles on the stationary bowl, alternating orientation.
   A deflector strike applies an impulse with randomized restitution and tangential scatter. **This
   is the primary chaos amplifier** and the main reason the outcome is unpredictable — do not
   smooth it out.
4. **Fret phase.** The ball reaches the pocket ring and is now interacting with the *rotating*
   frame. Detect crossings of the pocket separators (frets) using the ball's angle **relative to the
   rotor**, and apply a bounce impulse with restitution ~0.4–0.6 on each hit. The ball should
   visibly hop across several pockets, sometimes jumping back out of one.
5. **Settle.** Once relative kinetic energy falls below a threshold and the ball is inside a pocket,
   nest it and lock it to the rotor frame. It then rides around with the wheel. Read the pocket
   index → that's the number.

**Integration:** fixed timestep accumulator at **1/240 s**, decoupled from `requestAnimationFrame`.
Clamp accumulated `dt` to ~100 ms per frame so returning from a backgrounded tab doesn't explode the
sim. Use analytical crossing detection (or sub-stepping) for fret hits — the ball must never tunnel
through a fret.

**Entropy at launch.** Seed from `crypto.getRandomValues()` per spin. Randomize: rotor starting
angle, rotor angular velocity, ball release angle, ball launch speed, and small per-bounce scatter.
Ranges should be tight enough that spins look consistent and last a similar time, but wide enough
that the outcome is not predictable.

**Target spin duration: 10–13 seconds** from launch to settle. Real wheels take longer; this is an
event, keep it moving. Make it a tunable constant.

### 3.2 Fairness check (this is the only "testing" I want)

Build a **headless batch mode**: run the simulation without rendering, N times, and report the
distribution. Expose it in the debug panel as a button ("Run 10,000 spins") that renders a histogram
plus a chi-square statistic against uniform.

Any systematic bias — a pocket that never wins, or a cluster near the drop point that wins twice as
often as it should — is a bug in the model, not a quirk. Fix it by adjusting the deflector scatter
and fret restitution until the distribution is flat. A batch of 10,000 must complete in a few
seconds, so keep the physics step allocation-free.

## 4. Wheel geometry and data

**Make the wheel type a config flag.** Default to **European (single zero, 37 pockets)**. Include
American as an option. Use these exact pocket orders — this is the #1 thing agents get wrong, so
copy them verbatim rather than generating them.

**European, clockwise from 0 (37 pockets):**

```js
const EUROPEAN = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,
                  24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
```

**American, clockwise from 0 (38 pockets):**

```js
const AMERICAN = ['0',28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,'00',
                  27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2];
```

**Colors:**

```js
const RED   = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const BLACK = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];
// 0 and 00 are green
```

**Approximate real dimensions** (starting points, tune by eye):

- Bowl / overall diameter: 0.81 m (a standard 32" casino wheel)
- Ball track radius: ~0.36 m, bank angle ~25–35° from vertical
- Pocket ring outer radius: ~0.20 m
- Pocket depth: ~10 mm, fret height ~8 mm
- Ball diameter: 18 mm (ivorine/phenolic ball)
- `g = 9.81 m/s²`

## 5. Visual direction

The brief is **"realistic but simple."** Resolve that as: precise geometry, restrained materials,
excellent lighting — not texture-heavy photorealism. It should read as a clean product render of a
real wheel, legible from across a room, at 60fps on an iPad.

- Fixed **three-quarter camera** looking down into the bowl at roughly 40–50°, framed so the whole
  wheel plus the winning-number display are visible without scrolling. One subtle camera move: a
  slow push-in as the ball leaves the track, settling back after the result. Nothing more.
- `MeshStandardMaterial` throughout. Three-point studio lighting plus a simple environment map for
  the metal. Dark polished wood or matte black for the bowl, brushed brass or chrome for the turret,
  spindle and deflectors, deep red / near-black lacquer for the pockets, warm ivory ball.
- Numbers on the rotor rendered as crisp textures or extruded text, readable at final camera
  distance.
- **Fake the expensive things.** Blurred contact-shadow plane instead of real-time shadow maps. No
  postprocessing stack, no bloom, no motion blur, no SSAO. If you want a highlight on the ball, put
  it in the material.
- Cap pixel ratio: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`.
- The one place to spend effort: **the moment the ball drops off the track and clatters across the
  frets.** That's what people watch. Get the timing, the audio, and the camera on that beat right,
  and keep everything else quiet.

Typography for the UI should feel like a casino billboard, not a dashboard: condensed, confident,
high contrast. Pick something with character for the winning number and a clean utility face for the
stats. Avoid the default look of a generic dark admin panel with a cyan accent.

## 6. UI and features

**Launch control.** Primary interaction is a **swipe along the ball track to launch** — swipe
velocity sets initial ball speed, so the dealer has real feel and contributes real entropy. Also
provide a plain **SPIN** button as a fallback. Disable both while a spin is in progress.

**Winning number display.** Large, unmissable, colored to match the pocket. Below it, the number's
properties: red/black, odd/even, 1–18 / 19–36, dozen, column.

**History billboard.** Last 20 results in a column, most recent at top, color-coded — mirroring the
LED display on a real table. This is the second most important element on screen after the wheel.

**Session stats panel** (collapsible): total spins, red vs black vs green counts, odd/even,
high/low, dozen distribution, and hot/cold numbers.

**Dealer controls:** *Void last spin* (for dealer error) and *Reset session* behind a confirm.

**Persistence:** write history to `localStorage` after every spin so a mid-event page refresh or
Safari tab reload doesn't lose the session. Wrap in try/catch and fall back to in-memory — private
browsing throws.

**Audio,** synthesized with the Web Audio API rather than shipping sample files: rotor whir pitched
to `omega_r`, ball rumble on the track, sharp clicks on deflector and fret hits, a final settle.
Unlock/resume the `AudioContext` on the first user tap. Include a mute toggle.

**Debug panel,** hidden behind a triple-tap in a corner: sliders for every physics constant, live
state readout, the headless batch/fairness tool, and a "force N spins" stress button. Everything
tunable without a rebuild.

## 7. iPad / iOS Safari specifics

Get these right up front; they're the difference between "web page" and "app."

- Viewport: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`
- Add-to-home-screen support: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, an `apple-touch-icon`, and a web manifest with `display: fullscreen`. I want to launch this chromeless from the home screen.
- Kill browser gesture interference: `touch-action: manipulation`, `-webkit-touch-callout: none`, `-webkit-user-select: none`, `overscroll-behavior: none`, and a fixed-position non-scrolling body. No double-tap zoom, no rubber-band, no text selection, no long-press menus.
- Handle both orientations gracefully (Safari can't lock orientation), but optimize for landscape.
- Handle `webglcontextlost` / `webglcontextrestored` — iOS drops the context when the tab is backgrounded. Pause the sim on `visibilitychange` and resume cleanly.
- Optionally request a `navigator.wakeLock` screen lock so the iPad doesn't sleep between spins. Feature-detect it.
- Respect `prefers-reduced-motion` for UI transitions only — the wheel is the point, don't disable it.

## 8. Suggested structure

```
index.html
src/
  main.js              // bootstrap, game loop, phase orchestration
  config.js            // ALL tunable constants in one place
  physics/
    rotor.js
    ball.js
    simulate.js        // fixed-step integrator; also drives headless mode
  render/
    scene.js           // camera, lights, env
    wheel.js           // bowl, rotor, frets, deflectors, numbers
    ball.js
  data/
    layouts.js         // pocket orders, colors, number properties
  ui/
    display.js         // winning number + properties
    history.js
    stats.js
    launch.js          // swipe handling
    debug.js
  audio/
    engine.js
```

Keep `physics/` completely free of three.js imports. It should run headless in Node with no changes
— that's what makes the fairness check cheap, and it enforces the separation that keeps the outcome
honest.

## 9. Phased delivery — stop and report after each phase

**Phase 1 — Physics, headless.** No rendering at all. Build the model, integrate it, log
`{ winningNumber, spinDuration, revolutionsBeforeDrop, deflectorHits, fretHits }` to the console.
Run the 10,000-spin fairness check and show me the distribution. **Do not start on graphics until
the distribution is flat and spin durations are consistent.**

**Phase 2 — Render.** Wire three.js to the existing sim state. Correct geometry, materials,
lighting, camera. The ball's visible motion must be driven entirely by the Phase 1 state — no
animation curves.

**Phase 3 — UI and session.** Swipe launch, winning display, history billboard, stats, dealer
controls, localStorage, audio.

**Phase 4 — iPad polish.** Everything in section 7, plus performance passes until it holds 60fps,
plus the debug panel. Produce the static build and confirm it works when served from a
subdirectory.

At each stop, tell me: what you built, what you had to tune and why, anything in this brief that
turned out to be wrong or impractical, and what you recommend for the next phase.

## 10. Acceptance criteria

- [ ] Nothing in the codebase knows the winning number before the ball settles.
- [ ] 10,000 headless spins produce a distribution statistically indistinguishable from uniform.
- [ ] The ball completes 8–15 track revolutions, strikes deflectors, and hops between multiple
      pockets before settling. It never tunnels through a fret, rests on top of one, or leaves the
      bowl.
- [ ] The rotor is still visibly turning after the ball settles, with the ball riding in its pocket.
- [ ] Spin-to-result takes 10–13 seconds; consecutive spins never produce identical animations.
- [ ] Holds 60fps on an iPad through the entire spin.
- [ ] Swipe launch feels responsive; swipe velocity noticeably changes ball speed.
- [ ] Winning number and last-20 history are legible from ~10 feet away.
- [ ] Refreshing the page mid-session preserves history.
- [ ] Launches fullscreen from the iPad home screen with no browser chrome, no zoom, no rubber-band
      scroll, no selection artifacts.
- [ ] `npm run build` output runs correctly from a subdirectory on a plain static host.

## 11. Ask me before assuming

If you hit a genuine fork — European vs American, whether swipe-launch should replace the button
entirely, how much visual detail is worth the frame budget — ask rather than guessing. Otherwise
proceed and note your assumptions in the phase report.

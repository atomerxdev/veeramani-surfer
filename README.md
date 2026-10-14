# Veeramani Surfer — Tamil Nadu Street Runner

An original, stylized 3D endless runner for desktop and mobile browsers.
Veeramani, a fictional vlogger, is filming his channel in a fictional Tamil Nadu
street market (*santhai*) when two delivery boys grab his vlog bag. The game opens
on that vlog: the camera faces him, the boys come charging down the street, and
then you sprint — vault the crates, slide under festival banners and keep ahead of
**Delivery-Boy 1** and **Delivery-Boy 2**.

Built with **Vite + TypeScript + Three.js**, no backend, no accounts, no
third-party art or audio: every model, animation and sound effect is generated
procedurally at runtime.

> **Status:** Milestones 1–4 complete and playable (foundation, movement, core
> gameplay, endless track), plus the delivery-boy chase, opening vlog sequence,
> power-ups and the full UI/audio layer from milestones 5 and 7. See
> [PROGRESS.md](PROGRESS.md) for the milestone log and what is still outstanding.

---

## 1. Quick start

```bash
cd tamil-nadu-street-runner
npm install            # installs pinned dependencies (package-lock.json committed)
npm run dev            # dev server, usually http://localhost:5173/
```

Then open the printed URL. Click **Play** (or press Enter on the focused button).

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run typecheck` | `tsc --noEmit` over `src`, `tests` and configs |
| `npm test` | Vitest unit tests (`tests/unit`, Node environment) |
| `npm run test:e2e` | Builds, then runs the Playwright suite in a real Chromium |
| `npm run build` | Typecheck + production bundle into `dist/` |
| `npm run preview` | Serves the built bundle locally |

Requirements: Node 20.19+ (developed on Node 24) and a WebGL-capable browser.

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move left | `A` / `←` | swipe left, or the on-screen `←` pad button |
| Move right | `D` / `→` | swipe right, or the on-screen `→` pad button |
| Jump | `W` / `↑` / `Space` | swipe up, or the `↑` pad button |
| Slide | `S` / `↓` | swipe down, or the `↓` pad button |
| Pause / resume | `Esc` | the `II` button |
| Mute | `M` | the sound toggle in the menu |

Menu labels, buttons and the live HUD are real DOM elements, so they are
keyboard focusable and readable by assistive technology; run state changes are
announced through an `aria-live` region.

---

## 2. Architecture

Everything hangs off one facade (`GameApp`) and one state machine. Gameplay
classes never talk to the DOM, and UI classes never talk to Three.js, which is
what makes the interesting parts unit-testable without a browser.

```
src/
  main.ts                     browser entry: boots GameApp, fatal-error screen
  app/
    GameApp.ts                facade: renderer, scene, subsystems, run lifecycle
    GameConfig.ts             every tunable number + the coordinate system
    GameState.ts              Loading → MainMenu → Playing → Paused → GameOver
  core/
    GameLoop.ts               fixed-timestep loop + tab-visibility handling
    InputManager.ts           keyboard + pointer/swipe input, touch pad binding
    AudioManager.ts           Web Audio synthesis for every sound
    StorageManager.ts         LocalStorage profile with defensive parsing
    AssetManager.ts           optional async asset loading (all-or-nothing safe)
    Random.ts                 seeded PRNG (mulberry32) for reproducible tracks
  gameplay/
    PlayerController.ts       lanes, jump arc, slide, stumble, run cycle
    LaneSystem.ts             lane index + smoothed lateral position
    CameraController.ts       third-person follow camera, shake, reduced motion
    CollisionSystem.ts        pure AABB maths (no rendering dependency)
    HazardCatalog.ts          hazard hitboxes, required action, visual builders
    ObstacleManager.ts        hazard pooling, placement, scrolling, recycling
    CollectibleManager.ts     token pooling, magnet attraction, pickups
    PowerUpManager.ts         shield / magnet / multiplier / boost timers
    TrackManager.ts           segment streaming + safe content generation
    DifficultyManager.ts      speed & tier ramps, crash pressure, layouts
    ScoreManager.ts           distance + token scoring, best-score persistence
    ChaseManager.ts           the two delivery boys that react to pressure
    Effects.ts                pooled feedback rings
    character/                CharacterRig interface + procedural placeholder
  world/
    Palette.ts                the whole colour scheme in one place
    EnvironmentFactory.ts     shared geometry/material caches + prop builders
    MarketSegment.ts          one recycled stretch of street (variant slots)
    MarketBuilder.ts          assembles a segment: road, buildings, props
  ui/                         UIManager + one controller per screen
  styles/main.css             responsive, safe-area aware theme
```

### Coordinate system

Documented once in [GameConfig.ts](src/app/GameConfig.ts) and used everywhere:

- `+X` = right across the road (lanes run along X, `laneWidth` is configurable)
- `+Y` = up
- `-Z` = forward, the direction the runner faces

**The player stays at `z = 0` for the whole run and the market scrolls toward
`+Z` at the current speed.** That keeps every world coordinate small (no float
drift over long runs) and makes segment recycling a simple translation.

### Key design decisions

- **Fixed timestep.** Gameplay is simulated in 1/60 s steps with an accumulator,
  so lane changes, the jump arc and obstacles behave identically at 30 or 144 fps
  (verified: the dev machine runs the game at 144 fps with the same speeds).
- **Hitboxes are data, not meshes.** `HazardCatalog` declares each hazard's box
  and the action it demands; collision is a pure AABB test in
  `CollisionSystem`. Nothing depends on detailed geometry.
- **The rig is an abstraction.** `CharacterRig` is all gameplay code sees, so a
  rigged GLB protagonist can replace the procedural placeholder by implementing
  three members (`root`, `height`, `update`) and returning it from
  `CharacterFactory`.
- **Recycling over allocation.** Track segments, hazards, tokens, pickups and
  effects are all pooled and re-rolled in place; a segment never rebuilds
  geometry, it just toggles pre-built variants.
- **The generator guarantees fairness.** Rows are spaced at least
  `speed × minReactionTime` metres apart (0.9 s), and a row may only block every
  lane when a single action (all jump or all slide) clears it.
- **Two crashes end a run.** A crash stumbles the runner and raises chase
  pressure; crashing again before pressure decays ends the run. A shield absorbs
  a crash without pressure.

### Collision rules (in one table)

| Hazard | Hitbox | Cleared by |
| --- | --- | --- |
| Crate stack, handcart | ~1.85–2 m wide, 1.8–1.95 m tall | changing lane |
| Scooter, bicycle, parcel pile | 0.8–1.5 m wide, 1.05–1.6 m tall | changing lane (a precise jump can also work) |
| Low barrier | 2.4 m wide, 0.6 m tall | jumping |
| Overhead banner | from 1.06 m to 1.95 m | sliding |

Player collider: 0.72 × 0.7 m box, **1.78 m** standing / **0.95 m** sliding;
jump apex is ≈1.98 m (11.6 m/s launch against 34 m/s² gravity).

---

## 3. Build & deploy to a static host

```bash
npm run build      # -> dist/
npm run preview    # local check of the production bundle
```

`dist/` is a plain static site (HTML + CSS + one JS bundle, ~157 kB gzipped
including Three.js). `vite.config.ts` sets `base: './'`, so the same build works
at a domain root or in a subdirectory.

Because the game is a single-page app with relative asset URLs, any static host
works:

- **Netlify:** publish directory `dist`, build command `npm run build`.
- **Vercel:** framework preset "Vite", output directory `dist`.
- **GitHub Pages:** `npm run build`, then publish `dist/` (e.g. with
  `gh-pages -d dist`). No server rewrites are needed — there are no client-side
  routes.
- **Any web server:** copy `dist/` and serve it. Opening `index.html` straight
  from the filesystem (`file://`) will **not** work, because ES modules require
  an HTTP origin.

Recommended headers for hosting: `Cache-Control: public, max-age=31536000,
immutable` for `/assets/*` and `no-cache` for `index.html`. No special COOP/COEP
headers are required.

---

## 4. Implemented features

**Movement & camera**
- Three configurable lanes, smooth but responsive lane changes, hard lane limits
- Controlled jump arc with coyote time and input buffering
- Timed slide with a cooldown; jump and slide can never fight (verified by test)
- Body banking while changing lanes, run-cycle legs/arms, slide, jump, stumble
  and defeated poses blended additively
- Third-person follow camera: smoothed depth, faster lateral settle, speed-based
  FOV, crash shake, reduced-motion mode, instant snap on restart

**Endless track**
- Five recycled 26 m market segments (130 m of live road, fog hides the far end)
- Seamless joints: contiguous road slabs, no height or orientation changes
- Buildings, shop shutters, awnings, balconies, stalls, produce, overhead wires
  and bunting, scooters, bicycles, handcarts, crates and parcels
- Building/prop variant slots re-rolled on every recycle (no allocation)
- Deterministic seeded layout — `?seed=1234` reproduces a run exactly
- Content only ever spawns ≥52 m ahead, and the first two segments of a run are
  always left clear

**Gameplay**
- Seven hazard types with data-driven hitboxes and required actions
- AABB collisions evaluated against the *interpolated* lane position
- Market tokens with a generous pickup test and a spin/bob animation
- Shield, magnet, score multiplier and speed boost — each with a duration, HUD
  badge, refresh-not-stack behaviour and a hard clear on restart
- Distance + token scoring, live score, persistent best score
- Speed ramp (12.5 → 27 m/s) with a tier system that unlocks hazard types
- Two delivery boys whose distance follows chase pressure; they fall back when
  the player recovers

**UI & audio**
- Main menu, tutorial, HUD, pause, game over, settings, loading, touch pad
- One-screen-at-a-time visibility driven directly by the state machine
- Live HUD: score, best, tokens, power-up badges with countdowns, chase pressure
- Responsive CSS with `env(safe-area-inset-*)`, short-screen and landscape
  layouts, `prefers-reduced-motion` support
- Every sound is synthesised (jump, land, slide, stumble, crash, coin, power-up,
  shield absorb, menu click, game over, footsteps, market ambience) with a global
  mute and a user-gesture audio unlock

**Robustness**
- Pooled objects: a 5-minute run creates ~50 hazard meshes and then stops growing
- Tab hidden ⇒ auto-pause; WebGL context loss ⇒ pause + announcement
- LocalStorage failures (private mode, quota, junk JSON) can never crash a run
- 88 unit tests + Playwright suites across desktop, mobile and the production build

---

## 5. Tests

```bash
npm test            # 88 unit tests, Node environment, no browser needed
npm run test:e2e    # builds, then runs Playwright against dev + preview servers

# Latest results: 88/88 unit tests, 34/34 browser tests (14 desktop, 18 mobile,
# 2 production). If Playwright's browser download is unavailable, run against an
# installed browser instead:
PLAYWRIGHT_CHANNEL=chrome npx playwright test
```

**Unit tests** (`tests/unit`, Vitest) cover lane boundary rules, frame-rate
independence of lane movement, score maths and persistence, difficulty ramps and
crash rules, hazard-pattern fairness (no impossible rows, minimum reaction
spacing, token/hazard overlap), hitbox semantics for every hazard/player state,
power-up duration/expiry/refresh/cleanup, game-state transitions, track
streaming/recycling/determinism and stored-data validation.

**Browser tests** (`tests/e2e`, Playwright) run the real game in Chromium:
loads without console errors, automatic forward motion and scoring, keyboard
lane/jump/slide control with a real held-key auto-repeat check, pause freezing
and resuming, restart creating a fresh run, game-over summary, power-up badges
and expiry, one-active-screen invariant, settings/high-score persistence across a
reload, mobile viewport fit with no page scrolling, swipe gestures, the on-screen
touch pad, and the production bundle booting and playing.

Exact pass counts for the latest run are at the top of
[PROGRESS.md](PROGRESS.md).

---

## 6. Assets and licences

The project ships **no third-party art, audio or font files**, so there is
nothing to attribute beyond the code dependencies:

| Item | Source | Licence |
| --- | --- | --- |
| Character, market, props, effects | Built from Three.js primitives at runtime (`world/`, `gameplay/character/`) | Original, part of this project |
| All sound effects and ambience | Synthesised with the Web Audio API (`core/AudioManager.ts`) | Original, part of this project |
| UI theme, colours, layout | Original CSS (`src/styles/main.css`) | Original, part of this project |
| Three.js 0.186.1 | npm dependency | MIT |
| Vite 8 / Vitest 5 / Playwright 1.64 / TypeScript 7 | dev dependencies | MIT / Apache-2.0 |

Tamil glyph rendering uses the platform's Tamil font through a fallback stack
(`"Noto Sans Tamil", "Nirmala UI", "Latha", "Tamil Sangam MN"`). The in-world
signboards currently use painted colour blocks; adding baked Tamil sign textures
is tracked in PROGRESS.md and would use **Noto Sans Tamil (SIL Open Font
License 1.1)** if a font file is bundled.

---

## 7. Known limitations & next steps

- **Signage** uses colour blocks, not Tamil lettering yet (milestone 6).
- **Rendering optimisations pending:** the market is built from many small
  meshes with shared materials (~350 draw calls). Merging each building/prop into
  a single vertex-coloured geometry per segment is the planned fix, along with an
  instanced road.
- **Chase and power-up depth:** the delivery boys are animated followers, not AI; the
  magnet's visual pull could be smoother at the edge of its radius.
- **Balance** is first-pass: the tier ramp unlocks content but 2-lane blocks only
  become common late.
- **No music track** (ambience only) and no haptics.
- **Bundle size** is a single 611 kB chunk; splitting Three.js into a vendor chunk
  would improve caching.
- Mobile performance is tuned by the quality setting (pixel ratio, shadows,
  prop density) but has only been verified on desktop hardware and emulated
  viewports, not on physical mid-range phones.

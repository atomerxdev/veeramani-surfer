# Progress log — Veeramani Surfer

Living record of what is built, tested and still missing. Updated at the end of
every milestone.

**Project location:** `tamil-nadu-street-runner/` (sibling of the workspace root)
**Stack:** Vite 8 · TypeScript 7 · Three.js 0.186.1 · Vitest 5 · Playwright 1.64
**Last updated:** milestones 1–4 complete; 5 and 7 largely landed

---

## Milestone status

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Foundation (Vite + TS + Three.js, working scene) | ✅ Complete |
| 2 | Playable movement (lanes, jump, slide, keyboard + touch) | ✅ Complete |
| 3 | Core gameplay (hazards, collisions, tokens, score, game over, restart) | ✅ Complete |
| 4 | Endless track (recycled market segments, procedural layouts) | ✅ Complete |
| 5 | Chase & progression (delivery boys, speed ramp, power-ups) | 🟡 The two named delivery boys, the opening chase sequence, difficulty ramp and all four power-ups are done; no pursuit AI (by design) |
| 6 | Original art (final character, animations, Tamil signage, materials) | ⬜ Not started — placeholder procedural art is in place |
| 7 | UI & audio (menus, HUD, settings, pause, high scores) | 🟡 All screens, settings and synthesised audio done; no music track |
| 8 | Testing & optimisation | 🟡 88 unit tests + 3 Playwright projects; draw-call merging still pending |
| 9 | Release (production build, deployment docs) | 🟡 Build verified and deploy docs written; not yet deployed anywhere |

---

## What works (verified, not assumed)

**Milestone 1 — foundation**
- `npm run dev` serves the game; the scene, lights, fog and camera are live.
- `npm run build` produces `dist/`; `npm run preview` serves it and the built
  bundle boots, plays and scores (checked in a real browser).

**Milestone 2 — movement**
- Three lanes, automatic forward motion, smooth lane changes, hard lane limits.
- Jump arc (apex ≈1.98 m) with coyote time + input buffering; timed slide with
  cooldown; jump cancels a slide, a mid-air slide is ignored.
- Keyboard (`A/D/W/S`, arrows, space, `Esc`, `M`) and pointer swipes.
- Held keys cannot spam (auto-repeat is discarded) — covered by a browser test.
- 144 fps observed on the dev machine with identical simulation results.

**Milestone 3 — core gameplay**
- Seven hazard types, data-driven AABB hitboxes, collisions resolved against the
  interpolated lane position.
- Tokens with a generous pickup band, magnet attraction, pooled feedback rings.
- Score = distance points + token points at the live multiplier; best score
  persisted and shown on the menu, HUD and game-over summary.
- Crash → stumble → 1.05 s invulnerability; a second crash inside the recovery
  window ends the run. Shield absorbs a crash with no pressure.
- Pause stops the simulation (verified: distance frozen), restart clears every
  timer, pool and effect.

**Milestone 4 — endless track**
- Five 26 m segments stream and recycle; joints are contiguous, no gaps or height
  changes; object counts plateau (~50 hazard meshes after 5 minutes).
- Deterministic seeded layouts; `?seed=` and the debug seed line in settings.
- Fairness rules enforced in code and asserted by tests: ≥0.9 s reaction spacing
  between rows, no all-lane block unless one action clears it, no hazard ever
  spawns within 52 m of the player, the first two segments start clear.
- Note: a real generator bug was found by the spacing test (a row could be placed
  outside its segment, landing ~5 m from the next row) and fixed.

**Milestone 5 (partial) — chase & progression**
- Two named delivery boys trail the player — Delivery-Boy 1 (orange shirt, dark
  helmet) and Delivery-Boy 2 (red shirt, yellow cap), both with delivery boxes on
  their backs, so the pair reads instantly as a pursuit.
- They close in with chase pressure and fall back when pressure decays. Their
  trail distance sits deliberately *inside* the follow camera's distance, so both
  boys are always framed in the lower third of the screen; a config comment ties
  the two values together so they cannot silently drift apart and hide the chase.
- Opening vlog sequence: the camera is parked in front of Veeramani while he
  films, the two boys charge in from the far end of the street, and the view then
  cuts to the normal chase camera as the run starts (three timed beats in
  `GameConfig.intro`, driven by `GameApp.advanceIntro`).
- A REC/LIVE viewfinder overlay captions what he is saying and flips to an
  alarmed state on the beat where he is spotted (`VlogController`).
- Speed ramps 12.5 → 27 m/s with five difficulty tiers unlocking hazard types.
- Shield, magnet, multiplier and boost with durations, badges, refresh-not-stack
  semantics and a hard clear on restart.

**Milestone 7 (partial) — UI & audio**
- Loading, main menu, tutorial, HUD, pause, game over, settings and touch pad.
- Exactly one screen active at a time (asserted in the browser tests).
- Settings persist: quality, reduced motion, sound, always-show touch pad.
- All audio synthesised with the Web Audio API; muted settings persist; audio
  unlocks on the first gesture.

---

## Tests run (latest full pass)

| Suite | Command | Result |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | ✅ 0 errors |
| Unit (Vitest) | `npx vitest run` | ✅ **88 passed / 88** (8 files, ~1 s) |
| Browser: desktop | `npx playwright test --project=desktop-chromium` | ✅ **14 passed** |
| Browser: mobile + production | `--project=mobile-chromium --project=production-chromium` | ✅ **20 passed** |
| Browser: everything | `npx playwright test` | ✅ **34 passed** (1.7 min) |
| Production build | `npm run build` | ✅ `dist/` 611 kB JS (156.6 kB gzip), 8.5 kB CSS, 10.8 kB HTML |
| Production smoke (real browser) | open `vite preview` output | ✅ boots, plays, scores, 144 fps |

Unit suites: `laneSystem` (7), `scoring` (10), `storage` (10), `difficulty` (13),
`collision` (19), `powerups` (12), `gameState` (7), `track` (10).

Browser suites: `gameplay` (8 tests × desktop + mobile), `ui` (6 × 2), `mobile`
(4), `production` (2). Playwright's bundled-Chromium download stalled on this
machine, so the suite was run against installed Chrome with
`PLAYWRIGHT_CHANNEL=chrome npx playwright test` — an opt-in switch in
`playwright.config.ts`. Unset it and Playwright uses its own browser.

### Bugs found and fixed by testing
1. **Cross-segment hazard spacing.** The gap check ignored the segment length, so
   a row could be generated outside its segment and land ~5 m from the next row,
   breaking the minimum reaction window. `DifficultyManager` now walks a spacing
   grid, defers slots across the seam and never places a row outside its segment.
2. **`Escape` could not resume.** Pausing disabled all input, including the pause
   key itself. `InputManager` now always forwards `pause` and `mute`; movement
   stays gated.
3. **Power-ups were almost never placed.** The candidate Z was rejected by a
   boundary check that could never pass. Placement now tries five candidate
   offsets and picks the first with a clear lane.
4. **Opening settings from the menu left the menu visible underneath.** The UI
   manager's cached state went stale, so two screens were active at once.
   `GameApp.openSettings()` now syncs the state; the "one screen at a time" test
   covers it.
5. **Missing favicon logged a 404** in the console (caught by the console-error
   assertion). An inline SVG data-URI icon is now declared in `index.html`.

### Manual checks
- Visual review of the running game at 1440×900, 393×851 portrait and 851×393
  landscape: character, market, props, HUD, fog, shadows and lane markings all
  render as intended; the touch pad appears only on touch-capable devices.
- Live controls in the browser: `A`/`D`/arrows/space/`Esc`/`M`, swipes, pad taps,
  pause freeze and restart were all exercised by hand as well as by the suite.

---

## Assets still required

| Asset | Purpose | Status |
| --- | --- | --- |
| Tamil sign textures / font file | Shop signage with real Tamil lettering | ❌ Not bundled. Needs Noto Sans Tamil (OFL 1.1); in-world signs are colour blocks today |
| Rigged GLB protagonist | Replace the procedural placeholder | ❌ Optional — `CharacterRig` + `CharacterFactory` are ready for it |
| Rigged GLB delivery boy | Same, for the two pursuers | ❌ Optional |
| Music bed | Menu / gameplay music | ❌ Not included (all sound is synthesised; no licensed music) |

No placeholder is allowed to block the game: if a GLB or audio file is missing,
the procedural rig and synthesised audio are used instead.

---

## Next milestone

**Milestone 6 (original art):** bake Tamil shop-sign textures from a locally
bundled Noto Sans Tamil, add tea-shop and vegetable-vendor detail passes, then
replace the procedural rig with a rigged GLB character through the existing
`CharacterRig` interface so the movement code is untouched.

Before that, two cheaper wins are queued from milestone 8:
- merge each building/prop into one vertex-coloured geometry per segment
  (roughly 350 draw calls → under 100),
- split Three.js into its own bundle chunk.

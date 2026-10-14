# Assets

**This directory is intentionally empty of binaries.** Veeramani Surfer ships no
third-party art or audio: the character, market, props and every sound effect are
generated at runtime (see `src/world/`, `src/gameplay/character/` and
`src/core/AudioManager.ts`). That keeps the repository licence-clean and the
initial download small.

The folders below are the drop-in locations for replacement assets. Nothing here
is required for the game to run — `core/AssetManager.ts` loads asynchronously with
a timeout and falls back to the procedural placeholder if a file is missing or
fails to parse.

## models/

| File | Used for | Fallback |
| --- | --- | --- |
| `kumaran.glb` | Rigged protagonist (idle, run, jump, slide, stumble, game over) | `ProceduralCharacter` |
| `rider.glb` | Delivery rider rig for the two pursuers | `ProceduralCharacter` (rider palette) |

To wire one in: implement `CharacterRig` (three members: `root`, `height`,
`update`) around a `GLTFLoader` scene in `gameplay/character/`, then return it
from `CharacterFactory.createCharacter()`. No movement, collision, chase or
scoring code changes.

Licensing rules for any model added here:
- must be created for this project, or licensed for commercial use **with**
  attribution recorded below (CC0 preferred; CC-BY acceptable; no
  non-commercial or no-derivatives licences),
- must not depict a real person's likeness or a real brand,
- must be compressed (Draco or Meshopt) and kept under ~2 MB.

## textures/

| File | Used for | Status |
| --- | --- | --- |
| `signs-tamil.png` (or per-sign PNGs) | Shop signage with Tamil lettering | Not yet created — in-world signs are painted colour blocks |

Tamil text must render with **correct glyph shaping**. Any bundled font/texture
provenance goes in the table below; the recommended font is **Noto Sans Tamil**
(SIL Open Font License 1.1), which may be bundled with the licence file next to
it.

## audio/

All current audio is synthesised. Recorded replacements would be dropped here and
played through `AudioManager.play()`:

`jump`, `land`, `slide`, `stumble`, `crash`, `coin`, `powerup`, `shield-block`,
`click`, `game-over`, `footstep`, `ambience/market-loop`.

Rules: original recordings or CC0/CC-BY sources only — **no copyrighted game
music or sound effects**. Record the source and licence for every file.

## Attribution record

Add one row per third-party asset that is actually added:

| Asset | Author / source | Licence | Used in |
| --- | --- | --- | --- |
| _(none yet)_ | | | |

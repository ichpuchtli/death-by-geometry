# GridWars54 Porting Notes

This folder is the local reference pack for using the original `docs/GridWars54` bundle to steer a rewrite, port, or Grid Wars alignment pass in Death by Geometry.

Regenerate the machine-readable manifests with:

```bash
node scripts/extract-gridwars54-reference.mjs
```

Primary outputs:

- `gridwars54-asset-manifest.json`
- `gridwars54-music-manifest.json`

## What the original bundle gives us

The original archive is strong enough to act as a reconstruction source, not just a mood board:

- 5 authored GFX tiers: `solid`, `low`, `med`, `high`, `user`
- 91 PNG assets total across those sets plus `colourpick`
- 37 shipped WAV files
- 4 tracker modules: `Theme0.it`, `Theme1.it`, `Theme1.it-old`, `Theme2.it`
- one missing audio reference in code: `shieldwarning.wav`
- one missing music fallback path set for non-Windows: `Theme0.ogg`, `Theme1.ogg`, `Theme2.ogg`

The Windows build uses BASS to load `.it` tracker modules directly, so the soundtrack is composition-level recoverable rather than “listen and guess” recoverable.

## Original Grid Wars roster and assets

The original `ShowEnemies` and powerup help in `gridwars.bmx` identify the visual semantics clearly:

| Grid Wars entity | Sprite asset(s) | Notes |
|---|---|---|
| Paul the Pinwheel | `pinkpinwheel` | 25 pts |
| Dimmy the Diamond | `bluediamond` | 50 pts |
| Shy the Square | `greensquare` | 100 pts |
| Cubie the Cube | `purplesquare1`, `purplesquare2` | 50/100 pts, split form |
| Sammy the Seeker | `bluecircle` | 10 pts |
| Dwight the Black Hole | `redcircle` | 150 pts |
| Selena the Snake | `snakehead`, `snaketail` | segmented enemy |
| Ivan the Interceptor | `redclone` | 100 pts |
| Trish the Triangle | `orangetriangle` | 150 pts |
| Indy the Butterfly | `indigotriangle` | 10 pts |
| Player ship | `whiteplayer` | player |
| Shot | `yellowshot` | player projectile |
| Pickup aura | `whitestar` | used behind powerups |

The powerup atlas is also mapped in code:

| Atlas frame | Meaning |
|---|---|
| 0 | Extra front shooter |
| 2 | Back shooter |
| 3 | Side shooters |
| 5 | Shot speed |
| 6 | Extra life |
| 7 | Super shots |
| 8 | Extra bomb |
| 9 | Shield |
| 10 | Bouncy shots |

## Music recovery status

The `.it` files are tracker modules with readable structure:

| File | Role in original | Song name | Orders | Samples | Patterns |
|---|---|---|---:|---:|---:|
| `Theme0.it` | intro | `arkanoid` | 5 | 14 | 4 |
| `Theme1.it` | in-game | `HOO-HA!` | 35 | 46 | 31 |
| `Theme1.it-old` | earlier alt version | `TuneAgeTheme1` | 14 | 85 | 13 |
| `Theme2.it` | hi-score | `Loop 17 - golden arches` | 6 | 31 | 4 |

The generated music manifest extracts:

- song title
- order list
- tracker init speed/tempo
- embedded message/comment text
- sample headers and names
- per-pattern packed event data decompressed into row/channel events

That is enough to:

- reconstruct arrangement and section order
- identify sample palette and drum kit choices
- port the themes into Web Audio, OpenMPT, MilkyTracker, or a custom sequencer
- create faithful renders or adaptive reinterpretations

What it does not yet do:

- export MIDI
- render audio
- normalize the event data into stems or note lanes for DAW import

## Current Death by Geometry alignment

### Enemy roster

The active web roster is defined in `web/src/spawner/spawn-patterns.ts` and instantiated in `web/src/game.ts`.

| Current Death by Geometry enemy | Closest Grid Wars counterpart | Match | Notes |
|---|---|---|---|
| `rhombus` | Dimmy the Diamond | High | Same visual role: direct tracker diamond. Current score/value tuning differs. |
| `pinwheel` | Paul the Pinwheel | High | Bounce + spin behavior remains close. |
| `square` | Cubie the Cube | Medium | Current web `square` is magenta and splits into `square2`; that is closer to Grid Wars cube logic than to green `Shy the Square`. |
| `square2` | Cubie child form | High | Small split child maps cleanly to the cube fragments. |
| `circle` | Sammy the Seeker | Medium | Shape/behavior match is good, but the current game only spawns circles as BlackHole overload children. Original Grid Wars treats blue circles as their own enemy family. |
| `blackhole` | Dwight the Black Hole | High | Gravity-well gameplay is aligned, but the current web version is much more elaborate and much higher value. |
| `sierpinski` | none | No direct original counterpart | Death by Geometry-specific addition. |
| `shard` | none | No direct original counterpart | Child of Sierpinski only. |
| `mandelbrot` / `minimandel` | none | No direct original counterpart | Current miniboss system, outside Grid Wars scope. |

### Important gaps if the goal is “more Grid Wars”

1. The original green square (`Shy the Square`) is missing as a distinct enemy identity.
2. The current magenta `square` family is doing the job of the original cube more than the original square.
3. Original Grid Wars includes snake, interceptor, triangle, and butterfly as core visible roster members; those are not in the active web spawn pools.
4. Original blue circles/seeker enemies are first-class enemies; the current web build demotes them to a BlackHole-only child type.
5. Current scoring and threat weights are tuned for the modern web game, not the original Grid Wars point economy.

## Current audio alignment

### SFX

The active web build still uses the older Death by Geometry / Geometry Wars-oriented WAV roster for base SFX:

- `start`
- `die`
- `die1`
- `crash`
- `square`
- `rhombus`
- `triangle2`
- `octagon`
- `pinwheel`
- `deathstar`
- `deathstar2`

That means the web SFX naming does not yet line up with the discovered Grid Wars54 WAV set, which is more role-specific and includes black-hole loops, bonus cues, shield cues, snake-tail impacts, quark hits, and generator/interceptor families.

Generated audio currently exists in `sounds/generated/` for:

- modern one-shot replacements for the legacy roster
- enemy form/destroy variants
- menu themes
- procedural-event replacement experiments
- game-over and medal-reveal stingers

### Music

Current Death by Geometry music is procedural synthwave built in `web/src/core/audio.ts`, with adaptive bass/pad/rhythm/arp/lead layering. That is a deliberate aesthetic break from Grid Wars54, which shipped authored tracker modules.

If the goal is tighter Grid Wars alignment, the biggest music decision is:

- keep the adaptive procedural score and only borrow Grid Wars timbre/phrasing
- or import the recovered tracker themes more directly as menu/game/score references

## Explicit “Grid Wars vs current web” references already in the repo

- `CLAUDE.md` states the project is inspired by Grid Wars.
- `PRD.md` frames the visual target as Geometry Wars-style neon spectacle rather than strict Grid Wars reproduction.
- `web/src/ui/hud.ts` still labels the game as a “Geometry Wars-inspired arcade shooter”.

That means the repo currently treats Grid Wars as lineage/context, not as a strict parity target.

## Practical port recommendations

If the objective is a closer Grid Wars pass without abandoning the current codebase:

1. Split the current `square` family into two explicit identities:
   - green `square` = Shy the Square
   - magenta `cube` = Cubie the Cube plus child form
2. Re-activate or re-add original roster members as first-class spawn-pool citizens:
   - seeker/circle
   - snake
   - interceptor
   - triangle
   - butterfly
3. Create a Grid Wars audio compatibility layer:
   - map original Grid Wars WAV semantics onto modern event hooks
   - keep current generated MP3s only where the original has no equivalent
4. Decide whether to:
   - port the `.it` themes directly, or
   - mine them for tempo, sample palette, and motif references for a procedural homage
5. Keep the generated manifests as the source of truth while doing the alignment work.

## Fast lookup files

- `docs/gridwars-research/gridwars54-asset-manifest.json`
- `docs/gridwars-research/gridwars54-music-manifest.json`
- `scripts/extract-gridwars54-reference.mjs`

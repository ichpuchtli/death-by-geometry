# CLAUDE.md — Death by Geometry

> Context document for AI assistants working on this codebase.
> Read this file, `PRD.md`, `ENEMY_DESIGNS.md`, and `TASKS.md` before making changes.

**Workflow rules:**
1. After each change, commit and push to master.
2. **MANDATORY: Update this CLAUDE.md file** after every code change to reflect the current state of the codebase. This includes: new/changed config values, new settings, architectural changes, new files, completed work items, and any other information that would help a future AI assistant understand the codebase. This update must be part of the same commit as the code change. **Also update the relevant skill file** if the change touches audio, enemies, or combat feedback systems.
3. **MANDATORY: Test every change with a Playwright test** before committing. Use the `/playwright` skill to write and run tests that verify your changes work correctly.

---

## What This Is

Death by Geometry is a browser-based twin-stick arcade shooter inspired by Geometry Wars and [Grid Wars](https://worldofstuart.excellentcontent.com/grid/wars.htm). Originally a Python 2/Pygame desktop game by Sam Macpherson (2013), rebuilt as TypeScript + raw WebGL deployed to GitHub Pages.

**Play it:** https://ichpuchtli.github.io/Geometry-Genocide/

Entirely client-side. WebGL renders everything (bloom, grid distortion, particle trails). Audio via Web Audio API with procedural synthwave music. Mobile uses twin-stick virtual joysticks.

---

## Project Vision

**Neon chaos** — dozens to hundreds of geometric enemies swarming the player with Geometry Wars-level visual spectacle. Difficulty curve:

- **0-30s (Tutorial):** Gentle. Rhombus, pinwheel, rare blackhole.
- **30-120s (Ramp Up):** Swarms + walls. Square and blackhole added. 20-40 enemies.
- **120-240s (Mid Game):** Formations. Sierpinski, blackhole. 30-60 enemies.
- **240-400s (Intense):** Ambush + cascade. Mandelbrot miniboss. 40-80 enemies.
- **400s+ (Chaos):** Maximum spawn rates. Screen constantly full.

Cadence system alternates **burst windows** (2x spawn rates) and **breathers** (trickle only) for tension/release. Player has 5 lives. Weapon auto-upgrades at score milestones.

---

## Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Build | Vite + vite-plugin-glsl |
| Rendering | Raw WebGL 2 (no framework) |
| Audio | Web Audio API (WAV SFX + procedural music) |
| Deploy | GitHub Actions → GitHub Pages |
| Package Manager | npm |

---

## Directory Structure

```
web/src/
├── index.ts                    # Entry point
├── game.ts                     # Main game loop, state machine, orchestrator
├── design-lab.ts               # BlackHole visual sandbox (press D from menu)
├── config.ts                   # ALL compile-time constants
├── settings.ts                 # Runtime-tunable settings (localStorage)
├── glsl.d.ts                   # GLSL import declarations
│
├── core/
│   ├── vector.ts               # Vec2 (immutable-style math)
│   ├── camera.ts               # Camera follow + screen shake
│   ├── input.ts                # Keyboard/mouse/touch unified input
│   ├── collision.ts            # Circle-circle collision detection
│   ├── audio.ts                # AudioManager (SFX + ProceduralMusic)
│   └── haptics.ts              # Vibration API wrapper
│
├── renderer/
│   ├── sprite-batch.ts         # Batched WebGL line/triangle renderer
│   ├── bloom.ts                # Multi-pass bloom post-processing
│   ├── grid.ts                 # Reactive spring-mass grid with gravity wells
│   ├── trails.ts               # Per-entity trail ring buffers
│   ├── starfield.ts            # Background star dots
│   └── webgl-context.ts        # Shader compilation helpers
│
├── entities/
│   ├── entity.ts               # Base Entity class
│   ├── player.ts               # Player ship (movement, shooting, weapon progression)
│   ├── bullet.ts               # BulletPool (object pooling)
│   ├── explosion.ts            # ExplosionPool (line particles)
│   ├── crosshair.ts            # Aim indicator (chevrons)
│   └── enemies/                # See enemy-reference skill for full roster
│       ├── enemy.ts            # Base Enemy class
│       ├── rhombus.ts          # Tier 1 — tracker
│       ├── pinwheel.ts         # Tier 1 — bouncer
│       ├── blackhole.ts        # Tier 3 — gravity well, absorbs enemies (supernova on overload)
│       ├── sierpinski.ts       # Tier 3 — fractal breakup
│       ├── mandelbrot.ts       # Miniboss — 3 HP stages
│       ├── [children]          # circle, shard, square2, minimandel
│       └── [9 unwired]         # triangle, fibspiral, mobius, koch, etc.
│
├── spawner/
│   ├── spawn-patterns.ts       # Enemy pools + formation generators
│   └── wave-manager.ts         # Event-based spawn scheduler + cadence
│
└── ui/
    ├── hud.ts                  # Score, lives, game over summary card
    ├── settings-panel.ts       # Settings panel (desktop sidebar + mobile)
    ├── virtual-joystick.ts     # Mobile twin-stick joysticks
    └── offscreen-indicators.ts # Edge arrows for off-screen enemies
```

---

## Architecture Overview

### Game Loop (`game.ts`)

`update(dt)`: player movement → BlackHole gravity → bullets → enemy AI → **enemy separation** → trail recording → wave manager spawning → collision/kills → child spawns → explosions/grid/camera → music intensity.

**Enemy separation** (`separateEnemies()`): Per-frame O(n²/2) pairwise position correction. If two enemies overlap (distance < sum of collision radii + `ENEMY_SEPARATION_BUFFER`), push both apart proportionally. Near-zero distance uses deterministic direction (index-derived, not random) for consistent frame-to-frame separation. Heavy overlaps (>50% of minDist) get 1.5× push strength for faster cluster resolution. BlackHoles immovable (weight 0), minibosses resist (0.25), all others 50/50. Enemies inside a BlackHole gravity well exempt (gravity wins). Spawning enemies participate in separation during the final 70% of their spawn animation (allows clustered formations to spread before spawn completes).

`render()`: grid → starfield → entities (normal blend) → trails + explosions (additive) → bloom → HUD.

### Rendering Pipeline

```
Scene FBO → Bloom (brightness extract → Gaussian blur → composite + chromatic aberration) → Screen
```

Bloom: ping-pong FBOs, half-res on mobile. Grid: own shader with gravity well uniforms (spacetime fabric). Trails: ring buffers with additive blending.

### Config System

**Every tunable value** lives in `config.ts` (compile-time) or `settings.ts` (runtime, localStorage). Nothing hardcoded in entity classes.

**`settings.ts`** (runtime-tunable via settings panel):
- Gameplay: spawn rate, lives, player/enemy speed, fire rate, starting phase, max enemies
- Visual: bloom intensity, trail length, resolution scale (0.25–2.0x)
- BlackHole gravity: attract radius, enemy/player pull, grid mass, perspective depth
- Grid physics: anchor stiffness, damping, max displacement
- GPU Stress: arena size (800–6400 × 500–4000), grid spacing/substeps/stiffness, bloom passes/threshold/radius
- Camera: zoom scale (0.5–1.5)
- Toggle: vulnerable during spawn

### Game States

`'menu'` | `'playing'` | `'gameover'` | `'design_lab'`

Controls: WASD move, mouse aim, click/hold shoot, F auto-fire, M mute, D design lab, Space restart.

---

## Build & Run

```bash
cd web
npm install
npm run dev      # Dev server with hot reload
npm run build    # Production build
```

TypeScript check: `npx tsc --noEmit` from `web/`

---

## Detailed Reference (Progressive Disclosure)

These skill files are loaded contextually when relevant:

| Skill | Contents | When loaded |
|---|---|---|
| **`.claude/skills/audio-system/`** | SFX, procedural music, ElevenLabs pipeline, kill signatures | Audio work |
| **`.claude/skills/enemy-reference/`** | Enemy roster, enable/disable, kill families, BlackHole, miniboss, elites, design lab | Enemy/spawner work |
| **`.claude/skills/combat-feedback/`** | Hitstop, kill signatures, heat system, recovery window, phase transitions, telegraphs, medals, game over card | Combat/HUD work |

Full development history: **`docs/DEVELOPMENT_HISTORY.md`**

### Completion Status
- Phases 1-3 (MVP, Visual Polish, Mobile & Audio): **Complete**
- New Enemies Expansion + Post-expansion Polish: **Complete**
- ROADMAP Phases 1-4 (Combat Feedback, Elites, Heat/Recovery, Miniboss): **Complete**
- ROADMAP Phase 6 (End-of-Run Story + Medals): **Complete**
- BlackHole Design Lab: **Complete** (4 new visual variants: Radiant Collapse, Swirl, Unstable Mass, Event Horizon)
- Circle gravity immunity: **Complete** (Circles immune to BlackHole pull + absorption)
- Enemy separation steering: **Complete** (Grid Wars-style pairwise push, replaces spawn-only separation)
- Formation group spawn sound: **Complete** (6 procedural "gatling brrrr" variants per formation type, individual SFX suppressed for 6+ enemy formations, first 2 leak through at 15% volume)
- Clustered formation spawns: **Complete** (all formation types spawn enemies at a single point; separation steering organically spreads them into blobs/lines/rings)
- Sierpinski fractal breakup: **Complete** (3-tier cascade: 1 boss → 3 medium → 9 small. Config: `SIERPINSKI_TIER_HP/RADIUS/SPEED/SCORE/DEPTH` arrays. Tier 0 is miniboss weight in separation. No more Shard spawns from Sierpinski.)
- Square removed: **Complete** (Square enemy deleted entirely — file, spawn pools, kill VFX, SFX, config all removed)
- Haptics cleanup: **Complete** (All haptics calls removed except `haptics.supernova()` on BlackHole overload detonation)
- Miniboss gravity immunity: **Complete** (Mandelbrot + Sierpinski tier 0 have `gravityImmune = true`)
- Bullet gravity bending: **Complete** (Bullets curve near BlackHoles. Config: `BULLET_GRAVITY_STRENGTH = 0.15`. Modifies velocity + updates angle for diamond rotation.)
- Spawn overlap fix: **Complete** (Separation steering now applies in final 70% of spawn animation instead of waiting for it to finish)
- Ominous supernova: **Complete** (1.5s destabilize telegraph with visual effects + rising drone audio, then massive 400-particle detonation with screen flash, 300ms hitstop, enhanced BH death audio with metallic ring layer)
- Phase 4 (Scores, Polish & Tuning): **Not started** — leaderboard, debug overlay, perf profiling

---

## Known Technical Debt

- WAV audio files are large (could convert to OGG/MP3)
- Procedural music uses setTimeout (not AudioContext scheduler — may drift)
- No spatial partitioning for collision (O(bullets*enemies) fine at current scale)
- 9 unwired enemy source files (re-enable via `EnemyType`, `createEnemy()`, spawn pools)
- No leaderboard or debug overlay yet

---

## Design Documents

- **`PRD.md`** — Full product requirements
- **`ENEMY_DESIGNS.md`** — All enemy type designs (shapes, animations, mechanics)
- **`TASKS.md`** — Phase-by-phase task checklist
- **`docs/gridwars54-analysis/`** — Grid Wars 5.4 research pack (alignment guide, asset manifests, music manifests)

---

## Important Conventions

- **All constants in `config.ts`.** New tunables go there.
- **Enemy classes are self-contained** (shape, colors, AI, rendering). Cross-system mechanics wired in `game.ts`.
- **Object pooling** for bullets and explosions. Enemies are not pooled.
- **Additive blending** for trails/explosions. Normal blending for entities.
- **Mobile detection** via `'ontouchstart' in window` (reduced bloom, particles, trails).
- **No external runtime dependencies.** Vanilla TypeScript + WebGL + Web Audio.
- **Commit working state.** Verify `npm run build` succeeds before committing.
- **Playwright tests**: Headed by default (WebGL renders). Pass `--headless` to opt out.

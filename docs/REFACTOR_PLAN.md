# Code Simplification & Modeling Review

> Review of the active TypeScript/WebGL codebase (`web/src/`) with a plan to simplify the architecture and improve the domain model so future LLM (and human) development is safer and faster.
> Generated: 2026-06-30

## 1. Current State

The active game is a browser-based twin-stick arcade shooter built with TypeScript, raw WebGL 2, and the Web Audio API. The project root also contains legacy Python/Pygame source files (`game.py`, `app.py`, `interface.py`, `library.py`) from the 2013 original, but `CLAUDE.md` and the deployed build describe the TypeScript version under `web/`.

### 1.1 Architecture

- **Entry:** `web/src/index.ts` creates one `Game` and runs `requestAnimationFrame(update → render)`.
- **Renderer:** `sprite-batch.ts` batches lines/triangles; `bloom.ts` post-processes the scene FBO.
- **Simulation:** `Game.update(dt)` runs everything sequentially:
  1. Input / camera shake
  2. Player movement & shooting
  3. Bullet update
  4. BlackHole gravity (enemies + bullets + player)
  5. Enemy AI / movement
  6. Enemy separation steering
  7. WaveManager spawning
  8. Collision detection
  9. Kill processing (score, VFX, SFX, hitstop, heat, child spawns)
  10. Grid physics / camera / heat / recovery / boss encounters
- **Render:** `Game.render()` draws grid → starfield → entities → trails/explosions/kill FX → bloom → HUD.

### 1.2 Tech Stack

| Component | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Build | Vite + vite-plugin-glsl |
| Rendering | Raw WebGL 2 (no framework) |
| Audio | Web Audio API (WAV SFX + procedural music) |
| Package Manager | npm |

---

## 2. Core Problem: `game.ts` Is a God Object

`web/src/game.ts` is **2,408 lines** and owns or directly manipulates virtually every subsystem:

- Holds references to renderer, bloom, grid, trails, camera, input, audio, player, bullets, enemies, explosions, crosshair, HUD, joystick, wave manager, starfield, haptics, design lab.
- Implements the full state machine.
- Implements BlackHole gravity, bullet bending, player pull.
- Implements all combat feedback: kill signatures, hitstop, heat, recovery, phase banners, telegraphs, screen shake, explosion layering.
- Implements both boss encounters (Sierpinski + Mandelbrot) with timers, spawn suppression, warning banners, HP bars.
- Implements spawn logic post-processing: caps, elite flags, trail registration, SFX, telegraphs.
- Implements medal computation and game-over flow.

**Why this hurts LLM reasoning:** a future assistant must keep the entire interaction matrix in context to change one behavior. Adding a new enemy type currently requires touching `createEnemy`, spawn pools, `getEnemyFamily`, kill-effect branches, SFX branches, elite rules, separation weights, and sometimes boss-specific cleanup. There is no single place that says “here is what an enemy is.”

---

## 3. Findings

### 3.1 Tight Coupling Hotspots in `game.ts`

| Location | What it does |
|---|---|
| Constructor (lines ~325–428) | Wires all subsystems by hand, registers global input handlers. |
| `update()` (lines ~775–1256) | ~480-line monolithic frame update. |
| Kill processing (lines ~959–1156) | Family-based `switch` over killed enemy type for VFX/SFX/hitstop/children. |
| Boss state (lines ~1391–1580) | Two nearly identical state machines for Sierpinski and Mandelbrot. |

### 3.2 Duplication

- **Enemy class boilerplate:** most enemy files repeat the same constructor/update/render structure. `renderGlow` is copy-pasted with only pulse frequency/radius varying across 10+ files.
- **Spawn effects:** `Enemy` defines four spawn styles, but the choice is encoded as method overrides plus duplicated fallback in the base class.
- **Rendering pipelines:** `Game.render()` and `DesignLab.render()` both implement nearly identical bloom/FBO/entity/additive passes.
- **Boss encounter state machines:** Sierpinski and Mandelbrot code in `Game` are structurally identical.

### 3.3 Mixed Responsibilities

| File | Responsibilities mixed together |
|---|---|
| `game.ts` | Simulation, rendering orchestration, audio events, UI state, scoring, stats, boss AI, spawn logic, gravity physics, heat/recovery. |
| `enemy.ts` + subclasses | AI movement, collision shape, rendering, spawn VFX, elite ring, death behavior. |
| `blackhole.ts` | Gravity behavior, absorption/overload state, ~650 lines of procedural rendering across 4 visual modes. |
| `wave-manager.ts` | Spawn scheduling, elite injection, burst/breather cadence, formation event bookkeeping for telegraphs. |

### 3.4 Modeling Weaknesses

- **Inheritance over composition:** `Enemy` is an abstract class with optional overrides. Cross-cutting concerns are resolved via `instanceof` chains in `Game` (`getEnemyFamily`, `separateEnemies`, kill processing, BlackHole gravity exemption).
- **Global mutable state:** `gameSettings` is imported and read in `Enemy`, `Player`, `Bullet`, `BlackHole`, `SpringMassGrid`, `WaveManager`, `spawn-patterns.ts`, `Game`, and `DesignLab`. It is convenient but makes isolated testing and local reasoning hard.
- **Entity lifecycle management:** there is no central lifecycle. Every place that kills an enemy must also unregister its trail, possibly spawn an explosion/children, and update stats/heat.
- **Config explosion:** `config.ts` mixes world, player, bullet, enemy, audio, spawner, UI, heat, recovery, boss, and medal constants.

### 3.5 Dead / Unwired Code

- **9 unwired enemy source files:** `triangle.ts`, `fibspiral.ts`, `mobius.ts`, `koch.ts`, `penrose.ts`, `mengerdust.ts`, `hyperbolicdisc.ts`, `tesseract.ts`, `klein.ts`. Their colors/speeds/scores/HP still exist in `config.ts` but they are not imported or spawned.
- **Unused haptics methods:** `HapticsManager.light/medium/heavy/death/bossSpawn/respawn/absorb/warning` exist but only `supernova()` is called.
- **Unused config:** `MOBILE_MAX_PARTICLES`, `Camera.screenToWorld`, some `SFX_NAMES` entries.
- **`DesignLab` duplication:** re-implements BlackHole attraction, trail lifecycle, grid impulses, explosion pooling, and entity cleanup instead of reusing `Game` systems.

---

## 4. Refactor Plan

> Scope for this refactor: structural simplification only. The 9 unwired enemies and legacy Python files are intentionally left untouched.

### 4.1 P0 — Quick Wins (low risk)

1. Type `createEnemy(type: EnemyType, ...)` instead of `type: string`.
2. Remove unused `HapticsManager` methods and the unused `web-haptics` dependency.
3. Remove dead config entries that are safe to delete (`MOBILE_MAX_PARTICLES`, etc.).
4. Delete or archive legacy Python files in the repo root after confirming they are not part of the active build.

### 4.2 P1 — Extract Systems from `game.ts`

Split `Game` into focused systems owned by `Game` but encapsulating their state. `Game` becomes an orchestrator: `this.systems.update(dt)` and `this.systems.render(renderer)`.

| System | Owns |
|---|---|
| `LifecycleSystem` | Trail attach/detach, enemy add/remove, explosion cleanup, bullet trail lifecycle automation. |
| `CombatSystem` | Collision result handling, kill VFX/SFX/hitstop, heat, kill signatures, run stats updates. |
| `SpawnSystem` | WaveManager integration, `createEnemy`, trail registration, spawn SFX/telegraphs, elite caps, BlackHole cap. |
| `GravitySystem` | BlackHole attraction for enemies/bullets/player, grid wells, circle flock centroids. |
| `BossSystem` | Sierpinski + Mandelbrot encounter state machines (shared generic encounter template). |
| `FeedbackSystem` | Screen shake, phase banners, border pulse, telegraphs, supernova flash. |

### 4.3 P2 — Better Domain Modeling

1. **Data-driven enemies:** replace `instanceof` ladders with explicit behavior records on `Enemy` (`family`, `gravityImmune`, `separationWeight`, `isMiniboss`, `onBulletHit`, `onDeath`).
2. **Centralize spawn logic:** move `createEnemy`, trail registration, grid impulse, and SFX into `SpawnSystem`.
3. **Automate trail lifecycle:** give `Enemy` a `TrailComponent` that auto-registers on spawn and auto-unregisters when `active` becomes false.
4. **Unify `renderGlow`:** move the common pulse-circle glow into `Enemy` with configurable amplitude/frequency.
5. **Split `config.ts`** into domain files under `web/src/config/` re-exported from `config.ts`.

### 4.4 P3 — Deeper Cleanup (future)

1. Parameterize `BlackHole` visual modes to collapse four render methods into one.
2. Share systems with `DesignLab` instead of duplicating gravity/trail/spawn logic.
3. Separate simulation from rendering in enemies for testability.

---

## 5. Running Checklist

- [x] **P0 cleanup** — type safety and dead-code removal.
  - `createEnemy` and `EnemyDeathResult` now use `EnemyType` instead of `string`.
  - Removed unused `HapticsManager` methods and the `web-haptics` dependency.
  - Removed dead config entries (`MOBILE_MAX_PARTICLES`) and unused `Camera.screenToWorld`.
- [x] **Extract `LifecycleSystem` + automate trails** — eliminates manual trail bookkeeping in `Game`.
  - New `web/src/systems/lifecycle-system.ts` owns `TrailSystem` and all trail register/unregister logic.
  - `Enemy.trailId` already existed; added `Bullet.trailId` so bullets no longer need a side `Map<Bullet, number>`.
  - `Game` now calls `this.lifecycle.spawnEnemy()`, `spawnBullet()`, `cleanupEnemies()`, `clearBulletTrails()`, and `clear()` instead of touching `TrailSystem` directly.
  - `DesignLab` receives `this.lifecycle.trailSystem`.
  - Manual `this.trails.unregister` / `this.bulletTrailIds` bookkeeping removed from kill processing, BlackHole absorption/supernova, boss spawns, minion spawns, child spawns, staggered spawns, death slowmo, and respawn.
- [x] **Extract `CombatSystem`** — moves the kill loop out of `game.ts`.
  - New `web/src/systems/combat-system.ts` owns kill processing, hitstop accumulation, kill signature VFX, heat value, and staggered child-spawn timing.
  - `web/src/spawner/enemy-factory.ts` extracted so `Game`, `CombatSystem`, and future `SpawnSystem` share one `createEnemy()`.
  - `web/src/core/run-stats.ts` extracted to break the `game.ts` ↔ `CombatSystem` circular dependency.
  - `Game.update()` now calls `this.combat.processKills(result)` and `this.combat.update(dt, this.gameTime)` instead of the ~200-line inline kill loop.
  - `Game` reads heat via `this.combat.heatValue` for bloom, border color, and music intensity; heat decay/survival pressure now live in `CombatSystem`.
- [x] **Extract `SpawnSystem`** — centralizes enemy creation.
  - New `web/src/systems/spawn-system.ts` executes `WaveManager` spawn requests: max-enemy / BlackHole / elite caps, ambush spawn duration, edge-push for player-proximity spawns, trail registration, grid ripple, spawn SFX (with formation leakthrough suppression), formation group sounds, and the spawn telegraph lifecycle (create / update / render).
  - `Game.update()` now calls `this.spawn.update(dt)`; `updateCombatFeedback` calls `this.spawn.updateTelegraphs(dt)`; `render()` calls `this.spawn.renderTelegraphs(this.renderer)`; `startGame()` calls `this.spawn.clear()`.
  - Removed from `game.ts`: the inline spawn loop, `createTelegraph`, `renderTelegraphs`, `playEnemySpawnSFX`, `playSFXAtVolume`, the `Telegraph` interface, `telegraphs`, and `formationSpawnCounts`.
  - **Bug fix:** `Game` previously reassigned `this.enemies` (via `cleanupEnemies` returning a new array and `= []` resets), so the array reference captured by `CombatSystem`/`SpawnSystem` deps went stale and combat-spawned children were orphaned. `cleanupEnemies()` now filters in place and `Game` resets via `.length = 0`, so the enemies array is a single shared reference.
  - `game.ts`: 1,856 → 1,664 lines.
- [x] **Extract `GravitySystem`** — centralizes BlackHole physics.
  - New `web/src/systems/gravity-system.ts` owns `applyAttraction(dt)` (enemy attraction + absorption + overload supernova + bullet bending), `applyPlayerPull(dt)`, `updateGravityWells()`, `updateFlocks()`, and `getEnemiesInGravityWell()` (used by `separateEnemies`).
  - State moved out of `game.ts`: `circleFlocks` and the per-BlackHole `supernovaWarningPlayed` set.
  - Game-owned supernova feedback (border pulse, hitstop, screen flash, haptics) routed back via `onSupernovaWarning`/`onSupernovaDetonate` callbacks; `supernovaFlashTimer` stays in `Game` (read in render).
  - `Game.update()` call sites unchanged in order: `gravity.applyPlayerPull` → `gravity.applyAttraction` → `gravity.updateFlocks`; `gravity.updateGravityWells()` retained at all three prior sites (gameover/hitstop/normal). `gravity.clear()` on reset + respawn.
  - `game.ts`: 1,664 → 1,489 lines.
- [x] **Data-driven enemy defs** — replace `instanceof` ladders.
  - Added behavior records to base `Enemy`: `family: EnemyFamily`, `isBouncer`, `separationWeight`. Set as `override` fields in Pinwheel (`pinwheel`/bouncer), CircleEnemy (`circle`), BlackHole (`blackhole`/weight 0), Mandelbrot (`mandelbrot`/weight 0.25), Sierpinski (`sierpinski`, tier-0 weight 0.25), MiniMandel (`minimandel`). Rhombus/Shard use the `rhombus` default (preserves prior `getEnemyFamily` fallback).
  - Deleted `CombatSystem.getEnemyFamily()` instanceof ladder — kill processing reads `enemy.family`.
  - `separateEnemies()` reads `enemy.separationWeight` and `enemy.isBouncer` instead of `instanceof BlackHole` / `instanceof Pinwheel`.
  - Remaining `instanceof` is only for concrete-member access (BlackHole gravity API, `Sierpinski.tier`, `MiniMandel.parent`, `BlackHole.absorbedCount`) — not classification ladders.
- [x] **Split `config.ts`** — domain-organized constants.
  - Constants moved into 11 domain files under `web/src/config/`: `world`, `player`, `bullet`, `enemy`, `spawner`, `effects`, `ui`, `combat`, `boss`, `audio`, `medals`.
  - `config.ts` is now a barrel (`export * from './config/...'`); all 176 exports preserved (verified by name-set diff), consumer imports from `'./config'` unchanged.
- [x] **`BossSystem` generic template** — collapse duplicate boss state machines.
  - New `web/src/systems/boss-system.ts`: one generic `BossEncounter` state machine (idle → time-trigger → warning → spawn → active → defeated, with shockwave-kill → respawn) instantiated twice from per-boss config.
  - Sierpinski config has no active phase; Mandelbrot config supplies an `onActiveUpdate` hook (MiniMandel spawns + stage transitions). Shared saved spawn-rate multiplier preserved (single value owned by `BossSystem`).
  - Removed from `game.ts`: 6 sierpinski + 7 miniboss state fields, `updateSierpinskiBoss`/`startSierpinskiBossWarning`/`spawnSierpinskiBoss`/`onSierpinskiBossDefeated` and the four miniboss equivalents, plus the duplicated HUD banner/HP-bar render blocks (now `boss.renderHud(hud)`).
  - `CombatSystem` boss-defeat callbacks now call `boss.onSierpinskiDefeated()` / `boss.onMandelbrotDefeated()`. Warning border-pulse + stage-break hitstop routed via `onWarning`/`requestHitstop`.
  - `game.ts`: 1,488 → 1,238 lines.

**All refactor checklist items complete.**

## 6. Suggested Implementation Order

1. **P0 cleanup** — type safety and dead-code removal.
2. **Extract `LifecycleSystem` + automate trails** — eliminates manual trail bookkeeping in `Game`.
3. **Extract `CombatSystem`** — moves the kill loop out of `game.ts`.
4. **Extract `SpawnSystem`** — centralizes enemy creation.
5. **Extract `GravitySystem`** — centralizes BlackHole physics.
6. **Data-driven enemy defs** — replace `instanceof` ladders.
7. **Split `config.ts`** — domain-organized constants.
8. **`BossSystem` generic template** — collapse duplicate boss state machines.

Steps 2–4 alone should cut `game.ts` by roughly half and are the biggest reasoning wins.

---

## 6. Success Criteria

- ✅ `npm run build` succeeds.
- ✅ `npx tsc --noEmit` reports no errors.
- ✅ Existing Playwright tests still pass.
- ✅ `game.ts` ~1,238 lines (from 2,408) — at the ~1,200 target.
- ✅ No new `instanceof` ladders introduced; the `getEnemyFamily` ladder removed and separation/bouncer checks made data-driven. Remaining `instanceof` is concrete-member access only.
- ✅ New enemy type can be added by editing only the enemy class (with behavior records) + `createEnemy()` case + spawn pools.

**Status: all refactor steps complete (2026-07-01).**

---

## 7. Documentation Updates

After each change, update:

- `CLAUDE.md` — architecture, directory structure, new systems, enemy modeling.
- This file — mark completed items and add notes about any deviations.
- Relevant skill files if audio/enemies/combat feedback systems change.

# Enemy System Reference

## When to Use
Use when working on enemy types, spawning, the wave manager, enemy AI, BlackHole mechanics, the miniboss encounter, the elite system, or the design lab.

---

## Active Enemy Roster

**In spawn pools (5):** rhombus, pinwheel, square, blackhole, sierpinski
**Child-only (4):** circle (BlackHole overload), shard (Sierpinski death), square2 (Square split), minimandel (Mandelbrot miniboss)
**Boss (1):** mandelbrot (encounter system, spawns at 240s/intense phase)
**Unwired (9):** triangle, fibspiral, mobius, koch, penrose, mengerdust, hyperbolicdisc, tesseract, klein

## How to Enable/Disable an Enemy

1. **`spawn-patterns.ts`**: Add/remove from pool arrays
2. **`enemy-factory.ts`**: Add/remove import and `case` in `createEnemy()` (`web/src/spawner/enemy-factory.ts`)
3. The enemy class sets its behavior records (`family`, `isBouncer`, `separationWeight`, `isMiniboss`, `gravityImmune`) as `override` fields — systems read these, so no `instanceof` ladders need editing
4. The `default` case falls back to Rhombus (graceful degradation); a missing `family` defaults to `'rhombus'`
5. Config entries can be left — unused config is harmless

## Enemy Class Hierarchy

All enemies extend `Enemy` (extends `Entity`). Key methods:
- `update(dt, playerPos?)` — AI movement
- `render(renderer)` / `renderGlow(renderer, time)` — drawing
- `onBulletHit(bulletAngle)` → `'damage'` | `'absorb'` | `'reflect'`
- `hit()` → `boolean` (true if dead)
- `onDeath()` → `EnemyDeathResult` (optional child spawning)

Special mechanics in systems (not enemy classes):
- BlackHole attraction + absorption: `GravitySystem.applyAttraction()` + `applyPlayerPull()` (`web/src/systems/gravity-system.ts`)
- BlackHole hard cap: max 4 active (enforced in `SpawnSystem`)

## Kill Family Mapping

Each enemy carries a data-driven `family: EnemyFamily` field (set as an `override` in the subclass); `CombatSystem` reads `enemy.family` for kill signatures/SFX (no `instanceof` ladder):
- Rhombus / Shard → `'rhombus'` (base default; Shard does not override)
- Pinwheel → `'pinwheel'` (also sets `isBouncer = true`)
- Circle → `'circle'` (default kill handler)
- BlackHole → `'blackhole'` (kill path accesses `absorbedCount`; also `separationWeight = 0`)
- Sierpinski → `'sierpinski'` (tier-0 sets `separationWeight = 0.25`)
- Mandelbrot → `'mandelbrot'` (`separationWeight = 0.25`)
- MiniMandel → `'minimandel'`

Separation behavior is likewise data-driven: `separationWeight` (0 = immovable, 0.25 = miniboss, 1 = normal) and `isBouncer` (ricochet) on each `Enemy`.

## BlackHole Mechanics

- Spawns anywhere in arena (not at edges). `spawnAnywhere()` method.
- Stationary. Pulls player + absorbs nearby enemies. Overload explosion spawns Circles.
- HP=8 (takes twice as many bullets as original). Hard cap: 4 active.
- Gravity settings (runtime-tunable): `bhAttractRadius` 400, `bhEnemyPull` 3.0, `bhPlayerPull` 4.0, `bhGridMassBase` 500, `bhGridRadiusMultiplier` 3.0
- **Circle gravity immunity:** Circles have `gravityImmune = true` — immune to BlackHole gravitational pull AND absorption. Scatter freely after overload explosion.
- **Visual modes:** `visualMode` property on `BlackHole` class:
  - `'radiant_collapse'` (default) — Grid Wars inspired. White-hot singularity point with many flickering radiating lines. Rays grow longer/more numerous with absorbed mass. No blob body.
  - `'swirl'` — Geometry Wars inspired. 4 logarithmic spiral arms of particles being sucked inward. Rotating accretion with connecting filaments. Dark core + bright accumulation ring.
  - `'unstable_mass'` — Dark pulsating void with multi-frequency radius oscillation. Crackling energy arcs (jagged lightning) shoot outward randomly. Noisy edge boundary. Jolt displacement.
  - `'event_horizon'` — Real black hole inspired. Large dark void disk, bright sharp ring at boundary (the defining feature). Orbiting particles at horizon. Infall streaks falling in from outside. Asymmetric corona brightening.
- **Palette:** `BLACKHOLE_PALETTE` in config.ts (replaced old `BLACKHOLE_ORANGE`). Colors for singularity, void, rays, swirl arms, arcs, horizon ring, corona, infall streaks, orbit dots.
- **Spacetime fabric:** Grid shader receives gravity well uniforms (up to 8). True funnel shape via perspective contraction. `bhGridPerspectiveDepth` setting controls 3D illusion strength.

## Elite System

Composable stat/behavior overlays — no new subclasses:
- **Metadata:** `Enemy.baseType` and `Enemy.isElite` fields on base class
- **Stat overlays** (`ELITE_MODIFIERS` in config.ts per family):
  - Rhombus: 1.4x speed, 3x score, +1 HP
  - Pinwheel: 1.3x speed, 2.5x score, +1 HP
  - Square: 2x score, +2 HP
  - BlackHole: 1.5x score, +4 HP
  - Sierpinski: 1.2x speed, 2x score, +1 HP
- **Presentation:** Golden dashed crown ring (`renderEliteRing()`), brighter colors
- **Injection:** `ELITE_CHANCE_BY_PHASE` — 0% tutorial/rampUp, 8% midGame, 15% intense, 22% chaos
- **Cap:** `MAX_CONCURRENT_ELITES = 3` (excess downgraded to normal)
- **Factory:** `createEnemy(type, pos, isElite)` applies modifiers. `SpawnRequest.isElite` flag flows through wave manager.

## Mandelbrot Miniboss

- **Encounter flow:** WARNING banner (3s) → spawn away from player → fight with HP bar → BOSS DEFEATED banner
- **Stats:** 20 HP, 3 stages (stage 2 at HP≤14, stage 3 at HP≤7), score 10000, collision radius 55
- **Stage escalation:** Movement speed (0.02→0.04→0.06), minion rate (3.5s→2s→1.2s), max minions (4→6→8). Stage transitions: cracking SFX + 100ms hitstop + screen shake.
- **MiniMandel minions:** 16px radius, 0.25 speed, 150 score. Parent tracks count; buds regrow (2s).
- **Spawn suppression:** 4x slower normal spawns during encounter
- **Death:** 150ms hitstop, triple explosion, all minions die, 1200-force shockwave, heat maxed, "BOSS DEFEATED" golden banner (3s)
- **`isMiniboss` flag:** Survives player contact (player dies, boss lives — checked in collision.ts)
- **Player death during fight:** Boss destroyed by shockwave; re-triggers after 5s respawn delay
- **Key files:** `mandelbrot.ts`, `minimandel.ts`, `enemy.ts`, `collision.ts`, `game.ts`, `audio.ts`, `hud.ts`

## Spawn System

`WaveManager` uses event-based scheduler. Events: `trickle`, `swarm`, `squad`, `wall`, `surround`, `pincer`, `ambush`, `cascade`. Each has phase restrictions, interval + variance, min/max count, handler returning `SpawnRequest[]`.

**Cadence:** burst windows (0.5x intervals) alternate with breathers (only trickle).

**Pools:** Weighted arrays in `spawn-patterns.ts`, per-phase (tutorial → rampUp → midGame → intense → chaos).

**Formations:** `generateSwarm`, `generateSurround`, etc. return `FormationResult{spawns, meta}` with side/center info for telegraphs.

## BlackHole Design Lab

Visual sandbox (press `D` from menu). 4 BH variants in 2x2 layout:
- Radiant Collapse, Swirl, Unstable Mass, Event Horizon
- `BLACKHOLE_PALETTE` in config.ts: singularity, void, ray, swirl, arc, horizon, corona, infall, orbit colors
- `needsGridPulse`/`gridPulseStrength` for grid sync from visual modes
- Click to spawn enemies (1-5 cycle types), attracted/absorbed by nearest BH
- **Overload aftermath:** When BH reaches MAX_ABSORB (12), it explodes, spawns Circles radially, massive explosion + grid impulse + camera shake. BH respawns at same position after 3s delay.
- Circles are gravity-immune — they scatter and remain free after overload (don't get re-absorbed by other BHs)
- `GameState` includes `'design_lab'`. `DesignLab` class in `design-lab.ts`.

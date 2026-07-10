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
- Stationary. Pulls player + absorbs nearby enemies. Overload explosion spawns Circles + Shards.
- HP=12. Hard cap: 4 active.
- **Spawn grace:** `spawnDuration = SPAWN_DURATION_BLACKHOLE` (3.0s, vs 1.5s default) — collision + gravity skip `isSpawning` holes, so this is a long **harmless** warp-in that stops a lethal gravity well from materializing on top of the player. `SpawnSystem` ambush override uses `Math.max` so it can't shorten it. Flow test: `tests/flows/81-blackhole-spawn-grace.yml`.
- **Ambient dust + swirl (live game):** each active hole is a `ParticleField` attractor (`Game.updateParticles()`) — dust streams into a glowing accretion disk, with `heat` (hue → amber-hot) rising with `absorbedCount` and spiking while destabilizing. Enemies also get a subtle tangential `GRAVITY_ENEMY_SWIRL` (0.35) so they spiral in. Units within the hole's reach spaghettify via the tidal death warp (`Game.renderEnemiesWarped()` + `Renderer.setWarp`). See combat-feedback skill for geometry shatter.
- **Hit feedback:** shooting a BlackHole kicks a `hitPulse` (outward ring pulse) + emits a puff of `hitSparks` that fan out from the impact point and fade — `registerHit()` / `renderHitFeedback()`. Replaced the old flat white-disc overlay (`renderHitFlash`).
- **Per-instance personality:** the constructor randomises each hole into a unique "beast" — `visualMode` (random dense/haze/corona/molten), `dustStrengthMult`/`dustRadiusMult`/`dustSwirl` (its dust-disk look, fed via `Game.updateParticles` → `FieldAttractor.strength/radius/swirl`), `enemySwirl` (its own tangential pull in `GravitySystem`, replacing the global `GRAVITY_ENEMY_SWIRL`), and `warpStretchMult`/`warpTwistMult` (tidal death-warp). Labs/gallery override `visualMode` after construction.
- Gravity settings (runtime-tunable, **Threat Lab port 2026-07**): `bhAttractRadius` 500, `bhEnemyPull` 24, `bhPlayerPull` 9, `bhGridMassBase` 600, `bhGridRadiusMultiplier` 3.0. Force = `pull / dist` px/ms. **Inescapable core:** inside `BH_CORE_RADIUS_FRACTION` (0.8) of the attract radius, pull is multiplied by `BH_CORE_PULL_MULT` (2.5) → effective pull 60 inside 400px, which beats Rhombus tracking speed (0.15 px/ms) — tracking enemies are captured anywhere within ~400px. Settings loader migrates old saved gravity values (`bhEnemyPull <= 5` → reset to new defaults).
- **Supernova (chaos-bomb tuning):** warning window `SUPERNOVA_DESTABILIZE_MS` = 350ms (per-instance `destabilizeDuration`); payload = absorbed × `CIRCLE_SUPERNOVA_SPAWN_MULTIPLIER` (3) Circles (`SUPERNOVA_SHARD_COUNT` = 0 — shard ejecta disabled, they read as noise at gameplay zoom); 1000 particles, 3 staggered shockwave rings (`GravitySystem.renderEffects()`, additive pass), 450ms flash, 'subdrop' detonation sound. **Detonation is checked every frame in `applyAttraction`** — previously it only ran inside the absorb branch, which is unreachable at full mass, so an unshot overloaded BH never blew (latent bug, fixed).
- **Stress wobble:** `GravitySystem.update(dt)` feeds `audio.setBlackHoleStress(level)` with the most-fed BH's `absorbedCount/MAX_ABSORB` (1 while destabilizing) — a continuous wobbling sub-bass loop that audibly builds as the well approaches critical.
- **Circle gravity immunity:** Circles have `gravityImmune = true` — immune to BlackHole gravitational pull AND absorption. Scatter freely after overload explosion.
- **Circle predictive tracking (lethal ejecta):** Circles no longer tail-chase (a same-speed pursuer aiming at the player's *current* position can never close on a fleeing target). `CircleEnemy.update(dt, playerPos, playerVel)` now **leads the target**: aims at `playerPos + playerVel × leadTime` where `leadTime = min(CIRCLE_LEAD_MAX_MS 550, dist/speed)` (first-order intercept, capped so a hard juke shakes it), so circles cut the corner to head the player off. On the **terminal approach** a `commit = min(1, dist/CIRCLE_COMMIT_RADIUS 220)` factor fades both the `displacer` swirl-offset and the `CIRCLE_FLOCK_PULL` cohesion to zero, so the final strike is a clean straight line instead of an orbit-past. Velocity is hard-set at constant `ENEMY_SPEED.circle` (0.35→**0.38**, "slightly more lethal" — can now run down a strafing player) so it never decelerates near the target; the eject burst is layered on top each frame (no compounding, since velocity is re-set). `playerVel` is threaded through the enemy update loop in both `game.ts` and the headless `sim/headless-game.ts` (other enemies ignore the extra arg). Config in `config/enemy.ts`: `CIRCLE_LEAD_MAX_MS`, `CIRCLE_COMMIT_RADIUS`. Flow test: `tests/flows/83-circle-predictive-tracking.yml`.
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

## Threat Lab (`?threat=1`)

Playable BlackHole **threat tuning** arena (`web/src/threat-lab.ts`) — separate from the visual Design Lab. Boots instead of the game; real player ship + rhombus trickle tracking the player vs. one BlackHole. Used to A/B the *feel* dimensions the user flagged as non-threatening.
- **Presets** (`THREAT_PRESETS`, keys 1-4): PRODUCTION (the shipped tuning — SINGULARITY gravity at 400px capture + CATACLYSM payload + subdrop, kept in sync with config), DREADNOUGHT (HP 20, 700ms warning), CATACLYSM (350ms warning, doom sound), SINGULARITY (radius 700, quake sound). Presets carry `coreRadiusFrac` (0.8 production, 0.4 others).
- Each preset bundles: `hp`, `maxAbsorb`, `attractRadius`, `enemyPull` + `corePullMult` (extra pull inside 40% of radius — the "inescapable core"), `playerPull`, `bulletBendMult`, `destabilizeMs`, `circlesPerMass` + `shardCount` payload, `particleMult`/`shockwaveRings`/`flashMs`/`shakeIntensity`, `sound` variant.
- **Capture math:** gravity force = `enemyPull / dist` px/ms; Rhombus tracking speed is 0.15 px/ms, so capture radius ≈ `enemyPull × corePullMult / 0.15` px. Production pull 3 → captures only <20px (why it feels weak).
- Keys: **E** feed to critical, **Q** detonate now, **A** cycle sound variant (independent of preset), **R** reset. `window.threatLab` exposed (`applyPreset(i)`, `forceFeed()`, `forceDetonate()`, `detonationCount`).
- Engine support added: `BlackHole.destabilizeDuration` instance field (default `SUPERNOVA_DESTABILIZE_MS` = 1500 in `config/enemy.ts`) — warning window is now per-instance tunable. Flow test: `tests/flows/77-threat-lab.yml`.
- **The user's picks were ported 2026-07** (SINGULARITY gravity tuned to 400px capture, CATACLYSM payload, subdrop sound, stress-wobble → short warning → burst audio sequencing). The lab remains the harness for future tuning; keep preset 1 in sync with production config.

## Specimen Gallery (`?gallery=1`)

Separate from the BlackHole Design Lab: a standalone **visual catalog** (`web/src/gallery.ts`) that boots instead of the game (via a `?gallery=1` branch in `index.ts`) and renders **every wired entity in one labeled grid** for screenshot-based visual review.
- Covers: player (idle + firing recoil/muzzle-flash), wingman; Rhombus/Pinwheel (+elite); Circle (r10/r16), Shard, MiniMandel; Sierpinski T0/T1/T2 (+elite), Mandelbrot; all 4 BlackHole `visualMode`s + a fed (7/12) + a destabilizing telegraph; looping spawn warp-ins; bullets, crosshair, kill/nova explosions, and a trail.
- Enemies animate in place: each frame calls the real `update()` then re-pins `position` to its cell so it stays put while rotation/pulse/swirl advance. BlackHole/Mandelbrot need `update()` for their animation.
- Reuses the real pipeline (`Renderer`/`BloomPass`/`SpringMassGrid`/`TrailSystem`/`Starfield`) so specimens look exactly as in-game. Auto-fit zoom packs the whole roster into one frame; HTML overlay `#gallery-labels` draws headers + labels. `window.gallery` exposes `paused`/`gridOn`/`bloomOn`/`starfieldOn`/`labelsOn` (keys Space/G/B/S/L).
- **When adding or restyling an enemy/effect, add it here too** so the catalog stays complete. Flow test: `tests/flows/76-gallery.yml`.

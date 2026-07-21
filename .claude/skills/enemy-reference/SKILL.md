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
- **Glass photon-ring (chromatic diffraction):** `BlackHole.renderGlassDiffraction()` is called in `render()` for **every** visual mode. Look = Glass Lab "spectral thick" (user pick): **7 stacked ROYGBIV bands** (`BH_DIFFRACTION_SPECTRUM`) fanned across ±`disp` around ~1.02× `collisionRadius` form a **smooth rainbow gradient rim** (red bent least/outer → violet most/inner), each band `thick` px of stacked concentric strokes via `drawRingBand()` (the renderer has no thick-line primitive; strokes are 1px). Plus a white core stroke and a slow **rotating specular glint** arc (light catching glass; driven by `wobbleTime`). Rendered in the normal entity pass (bloom makes it glow). Purpose: (a) prismatic interest, (b) a luminous defining edge so the **dim variants** (`haze`/`corona` draw a pure-black void over faint low-alpha clouds and were nearly invisible) read clearly, (c) the light-bending-physics look. Dispersion + band thickness widen with `absorbedCount/MAX_ABSORB` (heavier hole bends more light). Config in `config/enemy.ts`: `BH_DIFFRACTION_DISPERSION_BASE` 2.2 / `_PER_MASS` 4.5 / `_RING_ALPHA` 0.5 / `_BAND_THICKNESS_BASE` 2.5 / `_PER_MASS` 2 / `_SPECTRUM`. Chosen via the Glass Lab (`?glass=1`, `glass-lab.ts` — 9 variants).
- **Prominent spawn telegraph (dust-driven):** `BlackHole` overrides `renderSpawn()` (replaced the too-subtle generic gravity-well spawn — players kept drifting onto a hole as it formed). The **accretion "ring" is now the ambient dust field**, not perfect geometric rings: `Game.updateParticles()` registers a *spawning* hole as a dust `FieldAttractor` (strength/radius ramp with spawn progress, strong `swirl`≥0.9) and rains motes onto its growing footprint so the dust spirals inward into an organic accretion disk. `renderSpawn()` itself now draws only what dust can't: a legible amber "keep clear" warning (a throbbing footprint ring + a rotating dashed reticle, both driven by `Date.now()` since `update()`/`wobbleTime` is frozen during spawn) and the growing dark core. The grid gravity well (ramped by `spawnFactor` in `GravitySystem.updateGravityWells`) also deepens through the spawn. Paired with the bassy `playBlackHoleSpawn()` sound (see audio skill). Flow test: `tests/flows/88-blackhole-spawn-telegraph.yml`.
- **Ambient dust + swirl (live game):** each active hole is a `ParticleField` attractor (`Game.updateParticles()`) — dust streams into a glowing accretion disk, with `heat` (hue → amber-hot) rising with `absorbedCount` and spiking while destabilizing. The disk also **accumulates monotonically** (never depletes): per-hole `diskCharge` (0..1) grows over the hole's whole life (`BH_DISK_CHARGE_RATE`) + per absorb (`BH_DISK_CHARGE_ABSORB_GAIN`); the rim dust trickle scales mote count (`BH_DISK_MOTES_MIN/MAX`), life, and a tangential orbital bias (`BH_DISK_MOTE_TANGENT`) with it, so the ring visibly collects. Bullet hits spray extra dust off a fat disk (`BH_DISK_HIT_SPRAY`) without costing charge (all `BH_DISK_*` in `config/effects.ts`). Enemies also get a subtle tangential `GRAVITY_ENEMY_SWIRL` (0.35) so they spiral in. Units within the hole's reach spaghettify via the tidal death warp (`Game.renderEnemiesWarped()` + `Renderer.setWarp`). See combat-feedback skill for geometry shatter.
- **Hit feedback:** shooting a BlackHole kicks a `hitPulse` (outward ring pulse) + emits a puff of `hitSparks` that fan out from the impact point and fade — `registerHit()` / `renderHitFeedback()`. Replaced the old flat white-disc overlay (`renderHitFlash`).
- **Per-instance personality:** the constructor randomises each hole into a unique "beast" — `visualMode` (random dense/haze/corona/molten), `dustStrengthMult`/`dustRadiusMult`/`dustSwirl` (its dust-disk look, fed via `Game.updateParticles` → `FieldAttractor.strength/radius/swirl`), `enemySwirl` (its own tangential pull in `GravitySystem`, replacing the global `GRAVITY_ENEMY_SWIRL`), and `warpStretchMult`/`warpTwistMult` (tidal death-warp). Labs/gallery override `visualMode` after construction.
- Gravity settings (runtime-tunable, **Threat Lab port 2026-07**): `bhAttractRadius` 500, `bhEnemyPull` 24, `bhPlayerPull` 9, `bhGridMassBase` 600, `bhGridRadiusMultiplier` 3.0. Force = `pull / dist` px/ms. **Inescapable core:** inside `BH_CORE_RADIUS_FRACTION` (0.8) of the attract radius, pull is multiplied by `BH_CORE_PULL_MULT` (2.5) → effective pull 60 inside 400px, which beats Rhombus tracking speed (0.15 px/ms) — tracking enemies are captured anywhere within ~400px. Settings loader migrates old saved gravity values (`bhEnemyPull <= 5` → reset to new defaults).
- **Supernova (chaos-bomb tuning):** warning window `SUPERNOVA_DESTABILIZE_MS` = 350ms (per-instance `destabilizeDuration`); payload = absorbed × `CIRCLE_SUPERNOVA_SPAWN_MULTIPLIER` (3) Circles (`SUPERNOVA_SHARD_COUNT` = 0 — shard ejecta disabled, they read as noise at gameplay zoom); 1000 particles, 3 staggered shockwave rings (`GravitySystem.renderEffects()`, additive pass), 450ms flash, 'subdrop' detonation sound. **Detonation is checked every frame in `applyAttraction`** — previously it only ran inside the absorb branch, which is unreachable at full mass, so an unshot overloaded BH never blew (latent bug, fixed).
- **Stress wobble:** `GravitySystem.update(dt)` feeds `audio.setBlackHoleStress(level)` with the most-fed BH's `absorbedCount/MAX_ABSORB` (1 while destabilizing) — a continuous wobbling sub-bass loop that audibly builds as the well approaches critical.
- **Circle gravity immunity:** Circles have `gravityImmune = true` — immune to BlackHole gravitational pull AND absorption. Scatter freely after overload explosion.
- **Circle orbital tracking + BlackHole DNA (shipped; Circle-Lab picks ported):** the hard-lead tracking felt gimmicky — replaced with the **orbital** model (player = gravity well). `CircleEnemy.update` carries **persistent velocity** and applies a central spring toward the player (`CIRCLE_ORBIT_SPRING` 1.4e-6 × distance → stronger the further out, so orbits are bound) + **low drag** (`CIRCLE_ORBIT_DRAG` 0.995 → sustained orbits that slowly spiral in) + speed cap (`CIRCLE_ORBIT_SPEED_CAP` 0.55). The supernova eject burst is consumed once into `velocity` as initial momentum, and `GravitySystem.detonate` adds a **tangential kick around the player** (`CIRCLE_ORBIT_KICK_MIN/MAX` 0.28–0.44 random handedness; `CIRCLE_EJECT_RADIAL_SHARE` 0.5 keeps half the radial burst) so circles have angular momentum and **orbit** the player (~0.35 px/ms for ~1.5s) instead of collapsing straight in. **DNA layers:** each circle is a small **dust-field attractor** (`updateParticles` pushes a `FieldAttractor` with `PARTICLE_FIELD_CIRCLE_PULL` 380 / `_RADIUS` 110 / `_SWIRL` 1.5 into the same `attractors` array the holes use) **and** actively **sheds** a blue dust mote behind its motion (`PARTICLE_FIELD_CIRCLE_SHED` 0.5) — the attractor swirls the shed dust into a tight glowing **accretion halo**, visible even in fast play (attractor alone never forms in time). There are **no orbiting satellite dots** — the user found them gimmicky. Killing one throws **gold hit-sparks + a blue dust burst** in the bullet direction (`CombatSystem` `case 'circle'`), like shooting the hole itself. **Ratio:** `CIRCLE_SUPERNOVA_SPAWN_MULTIPLIER` 0.8 → a full 22-absorb hole ejects `round(22*0.8)`=**18** circles (kept ~18 after `MAX_ABSORB` 12→22 so more swell time doesn't mean more circles; was 3×=36 at 12). **BlackHole life-stage dust emission:** holes actively emit dust that rides the life cycle — a trickle scaling with fill (`PARTICLE_FIELD_BH_EMIT_RATE`), a hot inrushing storm while destabilizing (`PARTICLE_FIELD_BH_EMIT_CRITICAL`, hue slides cool→amber by `heat`), and a radial eruption on detonation (`PARTICLE_FIELD_BH_DETONATE_BURST` in `GravitySystem.detonate`; `field` is now a `GravitySystemDeps` member). Transient cap `PARTICLE_FIELD_MAX_TRANSIENT` raised 420→700 so supernova bursts aren't starved. **No trail:** `Enemy.hasTrail` (default true) is `false` on `CircleEnemy`; `LifecycleSystem.spawnEnemy` skips registration when false. The 3-satellite orbit-dot visual from the lab was intentionally **not** ported (user found it gimmicky). Vestigial: `flockCenter`/`updateFlocks`/`circleFlocks` remain for the Threat Lab but no longer drive game circles. Config in `config/enemy.ts` (`CIRCLE_ORBIT_*`, `CIRCLE_EJECT_RADIAL_SHARE`). Flow test: `tests/flows/83-circle-predictive-tracking.yml`.
- **Circle Lab (`?circles=1`, `web/src/circle-lab.ts`):** a preview/tuning sandbox for the Circle enemy's *tracking feel* + *BlackHole visual DNA*, built because the hard-lead above "feels gimmicky, needs elasticity/unpredictability." Fly the ship; a momentum-carrying flock hunts you with one of five live-switchable models (1 direct lead / **2 orbital — player as gravity well, spring pull + momentum + drag → overshoot/orbit/fall-back** / 3 elastic spring / 4 serpentine wander / 5 swarm boids) + toggleable DNA layers (O satellites — **default OFF** · P shed dust · U pulse · T streak; dark-core + accretion-ring body). Every circle is also a dust-field attractor so ambient dust swirls into an accretion halo around it (the headline decoration; `PARTICLE_FIELD_CIRCLE_*`). `window.circleLab` exposed. **Ported to the live game** (orbital model + dust-field halo drive real supernova circles — see the "Circle orbital tracking + BlackHole DNA" item above). Flow test: `tests/flows/84-circle-lab.yml`.
- **BlackHole visual-effect taxonomy (Taxonomy Lab `?taxonomy=1`, `web/src/taxonomy-lab.ts`):** a hole layers several named systems. Beyond the accretion-disc **mode** geometry (void + ring + halo), there are **three in-class particle systems that "swirl"**, all separate from the external ambient `ParticleField` dust:
  - **Swirl Arms** — `swirlParticles` rendered by `renderSwirlArms()`: 4 spiral accretion streams spiralling inward (this is usually what people mean by "the swirling thing").
  - **Orbit Dots** — `horizonParticles`: dots circling the ring at ring-radius with short trail arcs.
  - **Infall Streaks** — `infallStreaks`: radial streaks raining inward toward the ring.
  Each is gated by a component-visibility flag — `showSwirlArms` / `showOrbitDots` / `showInfallStreaks` (all default `true`, so the shipped hole is unchanged). The Taxonomy Lab flips them to render each system **solo** in a labeled cell (guards live in `renderSwirlArms`/`renderInfallStreaks` early-returns + an `if (!showOrbitDots) break` in each of the 4 inline orbit-dot loops). The lab also labels the 4 modes, the ambient dust field, the destabilize telegraph, and the hit-spark feedback — use it to pick which layer to graft onto another enemy (e.g. the Circle). `window.taxonomyLab` exposed. Flow test: `tests/flows/85-taxonomy-lab.yml`.
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
- **Overload aftermath:** When BH reaches MAX_ABSORB (22, `BLACKHOLE_MAX_ABSORB` in `config/enemy.ts`), it explodes, spawns Circles radially, massive explosion + grid impulse + camera shake. BH respawns at same position after 3s delay. **Circles are gravity-immune** (`gravityImmune = true`) — a hole never absorbs the ejecta of another (or its own on respawn).
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

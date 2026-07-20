# Combat Feedback Systems Reference

## When to Use
Use when working on hitstop, kill effects, heat system, recovery window, phase transitions, spawn telegraphs, medals, game over screen, or HUD combat indicators.

---

> **System ownership:** Kill processing, kill signatures, hitstop accumulation, and the heat value live in `CombatSystem` (`web/src/systems/combat-system.ts`). Spawn telegraphs live in `SpawnSystem` (`web/src/systems/spawn-system.ts`). Boss encounters (warning/HP/defeated banners, stage-break hitstop) live in `BossSystem` (`web/src/systems/boss-system.ts`). `Game` applies the hitstop timer, drives heat→bloom/border/music, and renders phase banners + recovery shield.

## HUD (Diegetic Ring layout + juice)

The in-game HUD is the **Diegetic Ring** layout (picked in the HUD Lab `?hud=1`) with the aliveness pass from the Juice Lab (`?juice=1`), ported into `ui/hud.ts`. `drawPlaying` renders a **count-up** score + **ship-chevron lives pips** in a top-center chip (unified accent `HUD_ACCENT` #38f2c8 — playing HUD only; menu/game-over stay green), FPS/enemies bottom-left, MUTED/AUTO-FIRE bottom-center. Juice — mostly self-driven by diffing the `drawPlaying(score, lives, …)` args each frame, advanced by the HUD's internal `stepJuice()` (self-timed off `performance.now()`): score **punch** on gain, **milestone** celebration every `HUD_MILESTONE_INTERVAL` (10k, banner + ring + HUD-local shake), **life juice** (pip pop+sparkle on gain, chevron **shatter** + red **damage vignette** on loss, red **heartbeat** at ≤1 life). Three `game.ts` hooks feed the rest: `hud.spawnBossHit(worldX,worldY,camera,score)` for `kill.enemy.isMiniboss` kills → a gold floating **"+N"** projected to screen (`w/camera.viewportWidth` = zoom, self-correcting for dpr/resScale/zoom); `hud.onPlayerHit()` + `camera.shake(12,0.3)` on `result.playerHit`; `hud.resetJuice()` on game start. **Not ported:** the combo multiplier (no combo system yet); floating +N is boss-only (too noisy on regular kills). Config `HUD_ACCENT`/`HUD_ACCENT_DIM`/`HUD_MILESTONE_INTERVAL` in `config/ui.ts`. Flow: `tests/flows/97-hud-ingame.yml`.

## Dark Matter Time Dilation

`TimeDilationSystem` owns the 0–100 resource, BlackHole-proximity harvesting, unscaled drain, 0.28x target, and smooth 180ms/400ms entry/exit ramps. `Game` applies its scale to the whole normal-playing simulation only; hitstop, pause, visibility suspension, and death slowmo take precedence. The HUD draws the meter as a **compact bottom-right charge dial** (desktop) / **gated mobile TIME button** (hidden below `DARK_MATTER_MIN_ACTIVATION`, fades in as charge nears ready) — part of the Diegetic Ring port that replaced the old always-on bottom-center bar. Juice: a **ready ping** ("READY" bloom when charge crosses activation), an **engage burst**, a **harvest mote stream** flowing into the dial, plus the restrained full-screen vignette + radiating **warp streaks** while active. Insufficient-charge flash still tints the dial/activation-tick red. Deterministic coverage: `tests/flows/94-dark-matter-time-dilation.yml`.

## Hitstop

Freezes gameplay simulation (enemies, bullets, spawner) while visuals keep running (explosions, grid, camera shake). Accumulated in `CombatSystem` (and `GravitySystem`/`BossSystem` via callbacks); consumed and applied by `Game`.
- **Per-family durations:** square 35ms, sierpinski 50ms, blackhole 75ms, elite 65ms
- **Multi-kill bonus:** 3+ kills same frame → 35ms
- Config: `HITSTOP_SQUARE`, `HITSTOP_SIERPINSKI`, `HITSTOP_BLACKHOLE`, `HITSTOP_ELITE`, `HITSTOP_MULTIKILL`

## Weapon Recoil / Muzzle Feedback

Every player trigger pull produces subtle, player-local feedback — **no camera shake** (an earlier camera-punch version was too jarring at the ~3/s cadence). Owned by `Game.update()` when `player.tryShoot()` returns shots:
- **Audio:** `audio.playShoot(shots.length)` — procedural **"Deep Thump"** sub-bass blast (a saturated 130→32 Hz sine kick + tiny click transient), beefier/deeper with more pellets. Picked in the Player Design Lab (`?player=1`); see audio-system skill.
- **Ship recoil:** `player.kickRecoil(pellets)` nudges the ship backward along the **aim** vector and springs it back over `PLAYER_RECOIL_DECAY` (90ms). Kick distance = `PLAYER_RECOIL_BASE` (2.5px) + `PLAYER_RECOIL_PER_PELLET` (0.6) × (pellets−2). Applied in `Player.render()` via a decaying `recoilTimer` fraction (does not move the collision position, only the drawn ship).
- **Muzzle flash:** a **"Ring Pop"** — two expanding concentric rings bloom out of the barrel while recoil is active (was a 3-line spike; Player Design Lab pick). Radius grows as recoil decays; base + growth scale with `recoilFlashLen` = `PLAYER_MUZZLE_FLASH_LENGTH` (12px) + `PLAYER_MUZZLE_FLASH_PER_PELLET` (1.5) × (pellets−2). Rendered in the player's normal-blend pass; bloom makes it glow. (The ship silhouette itself is now the closed **"Wraith"** chevron — see the player-ship note in CLAUDE.md.)

Only the player fires these cues; the AI wingman shares the bullet pool but is intentionally silent/recoil-free.

## Directional Death Shatter (bullet momentum)

Kill fragments **conserve the killing bullet's momentum**: `collision.ts` records `impactAngle` (bullet travel direction) on each `killedEnemies` entry; contact kills use the enemy's own velocity instead. `Explosion.init()` accepts an optional `direction` — when set, fragments fan **forward** in a triangular-distribution cone (`DEATH_FRAGMENT_CONE` 1.35 rad ≈ ±77°) with speed falling to `DEATH_FRAGMENT_SIDE_DAMPING` (0.45) at the edge and an overall `DEATH_FRAGMENT_FORWARD_BOOST` (1.4). **Nothing flies back toward the shooter.** Config in `config/effects.ts`.

- Directional: regular unit kills (default family, pinwheel, sierpinski T1/T2), Threat Lab bullet kills.
- Radial (stored-energy detonations dwarf bullet momentum): Mandelbrot, BlackHole, Sierpinski T0 boss, supernovae, player death.
- Kill-signature rays follow the same forward fan on bullet kills (`spawnKillSignature(..., direction)`).
- Flow test: `tests/flows/79-directional-shatter.yml` (property-checks the cone + speed gradient on live particle data).

## Geometry Shatter (solid-object death)

`CombatSystem.emitShatter()` breaks a killed polygonal unit along its **own wireframe edges** into rigid tumbling shards (`DebrisField`, `web/src/renderer/debris-field.ts`) that carry the impact momentum, plus a colour-tinted spark puff (`field.spawnBurst`). Each shard is one literal edge (`SHATTER_EDGE_SUBDIV` = 1) rendered as a bright core line + two dimmer parallel offset lines (`SHATTER_THICKNESS`) so it reads as a solid strut, not a hairline — legibility tuning after the first port was invisible in the busy game scene. For shatter-eligible families (default/rhombus, pinwheel, Sierpinski T1/T2 — guarded by `getWorldPoints().length >= 3`, so ring units like circles fall through to their normal burst) the generic `Explosion` particle **cloud is cut to a small flash** — the shards + the directional kill-signature rays are the debris now. Bosses/BlackHole/supernova stay fully radial. `Game` owns `debris` + updates/renders it (additive pass); `SHATTER_*` config in `config/effects.ts`. Headless twin passes a no-op `stubDebris`/`stubField`. Flow test: `tests/flows/82-game-particles.yml`. Also demoed in the Particle Lab (`?particles=1`).

## Kill Signatures

Per-enemy-family death VFX rendered in additive blend pass (`KillEffect` array in `CombatSystem`; family read from `enemy.family`). On bullet kills the ray angles fan forward along the impact direction instead of the full circle (bosses stay radial):
- **Rhombus:** crystal burst with narrow rays + white tips
- **Square:** chunky rotating fragment outlines
- **Pinwheel:** spark spiral with rotating particles + bright tips
- **Sierpinski:** layered concentric triangle outlines expanding
- **Circle** (BlackHole ejecta): gold velocity-stretched hit-sparks + a blue dust burst fanned in the bullet direction via `field.spawnBurst` (like shooting the hole itself) + a small explosion; no shatter (ring unit). Counts bumped for visibility; shares the raised `PARTICLE_FIELD_MAX_TRANSIENT` (700) so it isn't starved during a supernova.
- **Elite kills:** golden-white primary burst + secondary colored burst (longer/larger)
- Config: effect duration (0.4s), ray count (6), ray length (80px)

## Phase Transitions

- `WaveManager` emits `onPhaseChange` callback
- Animated HUD banner: fade-in/slide-in, hold, fade-out with dark stripe + accent lines
- Border pulses white→orange
- Music intensity +0.15 bump
- Display names: STAGE 2, STAGE 3, DANGER, CHAOS
- Config: banner duration (2.5s), border pulse duration (1.5s)

## Spawn Telegraphs

- Formation generators return `FormationResult{spawns, meta}` with side/center info
- `WaveManager.formationEvents[]` populated each frame
- **Edge formations** (wall, swarm, cascade, pincer): pulsing orange border arcs
- **Area formations** (surround, ambush): dashed warning rings at spawn center
- Audio: `playTelegraphWarning()` — short square-wave buzz
- Config: telegraph duration (1.2s), color

## Heat System

Global `heat` value (0-1) owned by `CombatSystem` (`combat.heatValue`) tracking run intensity; `Game` reads it for bloom/border/music.

**Increases from:**
- Kills: base 0.02, elite 0.08, blackhole 0.12
- Dense combat: 3+ kills/frame → 0.01/kill bonus
- Phase transitions: +0.15
- Survival in intense+ phases: 0.003/s

**Decays:** 0.04/s when no kills for 2+ seconds

**Visual hooks:**
- Arena border warms (blue→orange/white) via `HEAT_BORDER_BRIGHTNESS_MAX` (0.5)
- Bloom intensity +`HEAT_BLOOM_BOOST_MAX` (0.5) at max heat
- Grid random micro-impulse turbulence at heat >0.1 (up to `HEAT_GRID_TURBULENCE_MAX` 60)
- Music intensity +0.15 * heat

**No explicit HUD meter** — heat communicated purely through visual/audio spectacle.

## Recovery Window

Activated on non-final respawn (after death slowmo). 3500ms duration. Non-stackable.

- **Invulnerability:** Full duration (overrides normal 2s invuln)
- **Fire rate:** 1.8x boost via `Player.fireRateOverride`
- **Shield:** Pulsing cyan ring around player (`renderRecoveryShield()` in game.ts)
- **Expiry warning:** Orange blink ring + descending tone at 800ms remaining
- **HUD:** "RECOVERY" banner with progress bar, color shifts to warn when expiring
- **Audio:** `playRecoveryStart()` (ascending power chord), `playRecoveryExpire()` (descending warning)
- Config: `RECOVERY_DURATION`, `RECOVERY_FIRE_RATE_MULTIPLIER`, `RECOVERY_SHIELD_COLOR`, `RECOVERY_SHIELD_RADIUS`

## Run Stats & Medals

**`RunStats` interface** in `web/src/core/run-stats.ts` (with `computeMedals()`) tracks: score, kills, timeSurvived, phaseReached, peakHeat, elitesKilled, blackholesKilled, minibossDefeated, livesUsed, recoveriesUsed, weaponStage.

**10 deterministic medals** (`MEDALS` in config.ts):
| Medal | Condition |
|---|---|
| UNTOUCHABLE | No deaths |
| CHAOS WALKER | Reached chaos phase |
| SURVIVOR | Reached intense+ |
| BOSS SLAYER | Defeated Mandelbrot |
| ELITE HUNTER | 5+ elites killed |
| GRAVITY MASTER | 3+ blackholes killed |
| INFERNO | 85%+ peak heat |
| COMEBACK KID | 2+ recoveries used |
| CENTURION | 100+ kills |
| THOUSAND | 1000+ kills |

Computed via `computeMedals()` at game over.

## Game Over Summary Card

Animated staggered reveal in `hud.ts` `drawGameOver()`:
1. Header (0s) → score (0.2s) → stats grid (0.4s+) → separator → medals (1.5s+) → replay prompt
2. Two-column stats: Left (Time, Kills, Phase, Weapon) / Right (combat stats, non-zero only)
3. Medal pop-scale animation with staggered delay (1.5s base + 0.25s/medal)
4. Medal reveal SFX at 1.5s if medals earned
5. Responsive layout scales for small screens

## Config Values Summary

All in `config.ts`:
- Hitstop: per-family ms durations
- Kill signature: duration 0.4s, rays 6, length 80px
- Phase transition: banner 2.5s, border pulse 1.5s
- Telegraph: duration 1.2s
- Heat: decay 0.04/s, kill increments, visual scaling maxes
- Recovery: 3500ms, 1.8x fire rate, shield radius 32px
- Miniboss hitstop: stage break 100ms, death 150ms
- Medals: 10 `MedalDef` entries (id, name, description, color)

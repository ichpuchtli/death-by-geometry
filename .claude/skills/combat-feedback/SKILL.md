# Combat Feedback Systems Reference

## When to Use
Use when working on hitstop, kill effects, heat system, recovery window, phase transitions, spawn telegraphs, medals, game over screen, or HUD combat indicators.

---

> **System ownership:** Kill processing, kill signatures, hitstop accumulation, and the heat value live in `CombatSystem` (`web/src/systems/combat-system.ts`). Spawn telegraphs live in `SpawnSystem` (`web/src/systems/spawn-system.ts`). Boss encounters (warning/HP/defeated banners, stage-break hitstop) live in `BossSystem` (`web/src/systems/boss-system.ts`). `Game` applies the hitstop timer, drives heat→bloom/border/music, and renders phase banners + recovery shield.

## Hitstop

Freezes gameplay simulation (enemies, bullets, spawner) while visuals keep running (explosions, grid, camera shake). Accumulated in `CombatSystem` (and `GravitySystem`/`BossSystem` via callbacks); consumed and applied by `Game`.
- **Per-family durations:** square 35ms, sierpinski 50ms, blackhole 75ms, elite 65ms
- **Multi-kill bonus:** 3+ kills same frame → 35ms
- Config: `HITSTOP_SQUARE`, `HITSTOP_SIERPINSKI`, `HITSTOP_BLACKHOLE`, `HITSTOP_ELITE`, `HITSTOP_MULTIKILL`

## Weapon Recoil / Muzzle Feedback

Every player trigger pull produces weighty feedback (owned by `Game.update()` when `player.tryShoot()` returns shots):
- **Audio:** `audio.playShoot(shots.length)` — procedural shotgun blast, beefier with more pellets (see audio-system skill).
- **Ship recoil:** `player.kickRecoil(pellets)` displaces the ship backward along the **aim** vector and springs it back over `PLAYER_RECOIL_DECAY` (100ms). Kick distance = `PLAYER_RECOIL_BASE` (6px) + `PLAYER_RECOIL_PER_PELLET` (1.6) × (pellets−2). Applied in `Player.render()` via a decaying `recoilTimer` fraction (does not move the collision position, only the drawn ship).
- **Muzzle flash:** a bright cyan-white 3-line burst blooms forward from the barrel while recoil is active; length = `PLAYER_MUZZLE_FLASH_LENGTH` (22px) + `PLAYER_MUZZLE_FLASH_PER_PELLET` (3) × (pellets−2), scaled by the recoil fraction. Rendered in the player's normal-blend pass; bloom makes it glow.
- **Camera punch:** `camera.shake(SHOOT_SHAKE_BASE + SHOOT_SHAKE_PER_PELLET × (pellets−2), 0.08)` — a short kick that grows with pellet count.

Only the player fires these cues; the AI wingman shares the bullet pool but is intentionally silent/recoil-free.

## Kill Signatures

Per-enemy-family death VFX rendered in additive blend pass (`KillEffect` array in `CombatSystem`; family read from `enemy.family`):
- **Rhombus:** crystal burst with narrow rays + white tips
- **Square:** chunky rotating fragment outlines
- **Pinwheel:** spark spiral with rotating particles + bright tips
- **Sierpinski:** layered concentric triangle outlines expanding
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

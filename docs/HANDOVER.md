# Handover: Refactor in Progress

> Created for the next Claude session to continue the `death-by-geometry` TypeScript/WebGL refactor.

## Current State

The active codebase is the TypeScript/WebGL version under `web/src/`. Legacy Python files in the repo root are intentionally untouched, as are the 9 unwired enemy types.

The refactor is being tracked in `docs/REFACTOR_PLAN.md` (running checklist) and `CLAUDE.md` (authoritative architecture/context). Both files were updated at the end of the last session.

## Completed Work

### P0 — Quick Wins
- `createEnemy()` typed with `EnemyType` instead of `string`.
- Unused `HapticsManager` methods and the `web-haptics` dependency removed.
- Dead config entries removed (`MOBILE_MAX_PARTICLES`, unused `Camera.screenToWorld`).

### P1 — `LifecycleSystem` (trail automation)
- New `web/src/systems/lifecycle-system.ts` centralizes enemy + bullet trail lifecycle.
- `Bullet.trailId` added; `Map<Bullet, number>` bookkeeping removed from `Game`.
- All manual trail register/unregister calls replaced with `lifecycle.spawnEnemy()`, `spawnBullet()`, `cleanupEnemies()`, `updateBulletTrails()`, `clear()`, `clearBulletTrails()`.

### P1 — `CombatSystem` (kill processing)
- New `web/src/systems/combat-system.ts` owns:
  - Collision-result kill processing
  - Score / enemiesKilled / run-stats updates
  - Per-family kill VFX, SFX, explosions, grid impulses, camera shake
  - Hitstop accumulation
  - Heat value + decay/survival pressure
  - Kill-signature VFX update/render
  - Staggered child-spawn timing
  - Mandelbrot parent notification and MiniMandel cleanup on boss death
  - Boss-defeat callbacks (`onMinibossDefeated`, `onSierpinskiBossDefeated`)
- New `web/src/spawner/enemy-factory.ts` extracts `createEnemy()` so `Game` and `CombatSystem` share one factory.
- New `web/src/core/run-stats.ts` extracts `RunStats` + `computeMedals()` to avoid a circular dependency between `game.ts` and `CombatSystem`.
- `Game.update()` now calls `this.combat.processKills(result)` and `this.combat.update(dt, this.gameTime)`.
- `Game` reads `this.combat.heatValue` for bloom, arena border color, and music intensity.
- `game.ts` reduced from **2,408 → 1,856 lines**.

### P1 — `SpawnSystem` (wave-manager execution)
- New `web/src/systems/spawn-system.ts` executes `WaveManager` spawn requests:
  - Cap enforcement (max enemies, ≤4 BlackHoles, elite cap)
  - Ambush spawn duration + edge-push for player-proximity spawns
  - Trail registration + grid ripple on spawn
  - Spawn SFX (with formation leakthrough suppression) + formation group sounds
  - Spawn telegraph lifecycle (create / update / render) + `formationSpawnCounts`
- `Game` calls `spawn.update(dt)`, `spawn.updateTelegraphs(dt)`, `spawn.renderTelegraphs(renderer)`, `spawn.clear()`.
- **Bug fix:** `Game` was reassigning `this.enemies` each frame, orphaning the array reference held by `CombatSystem`/`SpawnSystem` deps (combat-spawned children were lost). `LifecycleSystem.cleanupEnemies()` now filters in place and `Game` resets via `.length = 0`, so the enemies array is one shared reference across `Game` + all systems. **Do not reintroduce `this.enemies = ...` reassignments.**
- `game.ts` reduced from **1,856 → 1,664 lines**.

### P1 — `GravitySystem` (BlackHole physics)
- New `web/src/systems/gravity-system.ts` owns all BlackHole physics:
  - `applyAttraction(dt)` — enemy attraction, absorption, overload supernova (circle ejection + flock), bullet gravity bending
  - `applyPlayerPull(dt)` — player pull + world-bound re-clamp
  - `updateGravityWells()` — grid gravity-well registration
  - `updateFlocks()` — elastic circle-flock centroids
  - `getEnemiesInGravityWell()` — separation exemption set (called by `separateEnemies`)
- State moved out of `Game`: `circleFlocks`, `supernovaWarningPlayed`. `supernovaFlashTimer` stays in `Game` (render reads it).
- Game-owned supernova feedback is routed back via constructor callbacks `onSupernovaWarning` (border pulse) and `onSupernovaDetonate` (hitstop + screen flash + haptics). `gravity.clear()` runs on reset + respawn.
- `game.ts` reduced from **1,664 → 1,489 lines**.

## Suggested Next Steps (in order)

1. **P2 — Data-driven enemy definitions**
   - Replace `instanceof` ladders (`getEnemyFamily`, separation weights, gravity immunity checks) with behavior records on `Enemy` (`family`, `gravityImmune`, `separationWeight`, `isMiniboss`, etc.).
   - Goal: new enemy type requires only the enemy class + one definition record + spawn pool entry.

2. **P2 — Split `config.ts`**
   - Domain-organized files under `web/src/config/` re-exported from `config.ts`.
   - Domains: world, player, bullet, enemy, audio, spawner, UI, heat/recovery, boss, medals.

3. **P3 — `BossSystem` generic template**
   - Collapse the structurally identical Sierpinski and Mandelbrot encounter state machines into a shared generic encounter template.

## Key Architectural Decisions

- **Systems are owned by `Game` and mutate shared state directly.** They are not pure; they receive dependency objects (player, enemies array, lifecycle, audio, etc.) and mutate them. This keeps the refactor low-risk while removing the god-object surface area.
- **`Game` is the orchestrator.** It calls systems in sequence and reads values back (e.g., `combat.heatValue`, `combat.consumeHitstop()`).
- **Factory functions live in `spawner/`** so multiple systems can create enemies without circular imports.
- **Cross-cutting data (`RunStats`) lives in `core/`** to break circular dependencies between systems and `Game`.
- **Do not change the 9 unwired enemy types or legacy Python files** unless explicitly asked.

## Important Files

| File | Purpose |
|------|---------|
| `docs/REFACTOR_PLAN.md` | Running checklist with detailed completion notes |
| `CLAUDE.md` | Authoritative architecture, directory structure, conventions |
| `web/src/game.ts` | Main orchestrator (still owns boss state machines, rendering, heat/recovery feedback) |
| `web/src/systems/lifecycle-system.ts` | Trail lifecycle (in-place enemy cleanup) |
| `web/src/systems/combat-system.ts` | Kill processing, heat, hitstop, kill signatures |
| `web/src/systems/spawn-system.ts` | WaveManager execution, caps, spawn SFX, formation telegraphs |
| `web/src/systems/gravity-system.ts` | BlackHole attraction/absorption/supernova, player pull, grid wells, circle flocks |
| `web/src/spawner/enemy-factory.ts` | `createEnemy()` |
| `web/src/spawner/wave-manager.ts` | Spawn scheduler (unchanged) |
| `web/src/core/run-stats.ts` | `RunStats`, `computeMedals()` |

## Build / Verify Commands

```bash
cd web
npm install       # if needed
npm run build     # production build
npx tsc --noEmit  # TypeScript only
npm run dev       # dev server
```

Always run `npx tsc --noEmit` and `npm run build` after changes. Playwright tests are available under `tests/` but the last session did not run them.

## Gotchas / Notes

- `CombatSystem` callbacks (`onMinibossDefeated`, `onSierpinskiBossDefeated`) are passed as arrow functions in the constructor so `this` is bound correctly.
- `CombatSystem.clear()` resets heat and kill effects. `clearPendingSpawns()` only clears the staggered spawn queue; it is used on player respawn so heat persists across respawns (matches pre-refactor behavior).
- `Heat` visual hooks (bloom boost, grid turbulence, border color) remain in `Game.updateHeat()` because they touch renderer/grid state. Only the heat value and decay rules moved to `CombatSystem`.
- `MiniMandel` is still constructed directly in `Game.updateMiniboss()` for pending minion spawns. This will naturally move into `SpawnSystem` when that is extracted.
- `DesignLab` still duplicates some logic (gravity, trail lifecycle). That is explicitly P3 cleanup; do not scope-creep into it unless asked.

## Remaining Checklist (from `docs/REFACTOR_PLAN.md`)

- [x] P0 cleanup
- [x] Extract `LifecycleSystem`
- [x] Extract `CombatSystem`
- [x] Extract `SpawnSystem`
- [x] Extract `GravitySystem`
- [ ] Data-driven enemy definitions
- [ ] Split `config.ts`
- [ ] `BossSystem` generic template

## Success Criteria (from `docs/REFACTOR_PLAN.md`)

- `npm run build` succeeds.
- `npx tsc --noEmit` reports no errors.
- `game.ts` under ~1,200 lines.
- No new `instanceof` ladders introduced; existing ones reduced.
- New enemy type can be added by editing only the enemy class + one definition record + spawn pools.

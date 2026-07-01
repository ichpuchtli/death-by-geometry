import type { SpringMassGrid } from '../renderer/grid';
import type { Camera } from '../core/camera';
import type { AudioManager } from '../core/audio';
import { Player } from '../entities/player';
import { BulletPool } from '../entities/bullet';
import { Enemy } from '../entities/enemies/enemy';
import { BlackHole } from '../entities/enemies/blackhole';
import { CircleEnemy } from '../entities/enemies/circle';
import type { ExplosionPool } from '../entities/explosion';
import { LifecycleSystem } from './lifecycle-system';
import { createEnemy } from '../spawner/enemy-factory';
import { Vec2 } from '../core/vector';
import { gameSettings } from '../settings';
import {
  EXPLOSION_DURATION_LARGE,
  SCREEN_SHAKE_DEATH,
  BULLET_GRAVITY_STRENGTH,
  SUPERNOVA_PARTICLE_COUNT,
  SUPERNOVA_GRID_IMPULSE,
  CIRCLE_EJECT_SPEED_MIN,
  CIRCLE_EJECT_SPEED_MAX,
  CIRCLE_SUPERNOVA_SPAWN_MULTIPLIER,
} from '../config';

export interface GravitySystemDeps {
  player: Player;
  enemies: Enemy[];
  bullets: BulletPool;
  lifecycle: LifecycleSystem;
  explosions: ExplosionPool;
  grid: SpringMassGrid;
  camera: Camera;
  audio: AudioManager;
  /** Game-owned feedback when a BlackHole starts destabilizing (border pulse). */
  onSupernovaWarning: () => void;
  /** Game-owned feedback when a BlackHole detonates (hitstop, screen flash, haptics). */
  onSupernovaDetonate: () => void;
}

/**
 * Centralizes BlackHole physics: enemy attraction + absorption + overload
 * supernova, bullet gravity bending, player pull, grid gravity-well registration,
 * and the elastic circle-flock centroids ejected by supernovae.
 */
export class GravitySystem {
  private deps: GravitySystemDeps;
  private mobile: boolean;

  // Circle flock groups: shared centroid Vec2 updated each frame so circles snap back together
  private circleFlocks: Array<{ center: Vec2; members: CircleEnemy[] }> = [];

  // Tracks BlackHoles whose destabilize warning has already played
  private supernovaWarningPlayed = new Set<BlackHole>();

  constructor(mobile: boolean, deps: GravitySystemDeps) {
    this.mobile = mobile;
    this.deps = deps;
  }

  /** Register BlackHole gravity wells with the grid (spacetime fabric warp). */
  updateGravityWells(): void {
    for (const e of this.deps.enemies) {
      if (!e.active) continue;
      if (e instanceof BlackHole) {
        // Ramp gravity during spawn so the fabric warps in gradually
        let spawnFactor = 1;
        if (e.isSpawning) {
          spawnFactor = 1 - e.spawnTimer / e.spawnDuration; // 0→1 over spawn
          spawnFactor = spawnFactor * spawnFactor; // ease-in (quadratic)
        }
        const mass = -(gameSettings.bhGridMassBase + e.absorbedCount * gameSettings.bhGridMassPerAbsorb) * e.breathMassMultiplier * spawnFactor;
        const radius = BlackHole.ATTRACT_RADIUS * gameSettings.bhGridRadiusMultiplier * spawnFactor;
        this.deps.grid.applyGravityWell(e.position.x, e.position.y, mass, radius);
      }
    }
  }

  /** Apply BlackHole gravitational attraction to nearby enemies + absorb on contact */
  applyAttraction(dt: number): void {
    const { enemies, explosions, grid, camera, audio, player, lifecycle, bullets } = this.deps;

    const blackholes: BlackHole[] = [];
    for (const e of enemies) {
      if (e.active && !e.isSpawning && e instanceof BlackHole) {
        blackholes.push(e);
      }
    }
    if (blackholes.length === 0) return;

    for (const bh of blackholes) {
      const attractR2 = BlackHole.ATTRACT_RADIUS * BlackHole.ATTRACT_RADIUS;
      const absorbR2 = (bh.collisionRadius + 10) * (bh.collisionRadius + 10);

      for (const e of enemies) {
        if (!e.active || e.isSpawning || e === bh || e instanceof BlackHole || e.gravityImmune) continue;

        const dx = bh.position.x - e.position.x;
        const dy = bh.position.y - e.position.y;
        const dist2 = dx * dx + dy * dy;

        // Absorb enemies that get too close
        if (dist2 < absorbR2 && bh.absorbedCount < BlackHole.MAX_ABSORB) {
          e.active = false;
          bh.absorbEnemy();
          explosions.spawn(e.position.x, e.position.y, e.color, 15, 0.6);
          grid.applyImpulse(e.position.x, e.position.y, -20, 120);

          // Destabilize warning — play once per BH
          if (bh.destabilizing && !bh.overloaded && !this.supernovaWarningPlayed.has(bh)) {
            this.supernovaWarningPlayed.add(bh);
            audio.playSupernovaWarning();
            this.deps.onSupernovaWarning();
          }

          // Auto-explode on overload (after 1.5s destabilize)
          if (bh.overloaded) {
            bh.active = false;
            const absorbed = bh.absorbedCount;
            // Spawn circles — 2x count, random angles, elastic flock snap-back
            const circleCount = absorbed * CIRCLE_SUPERNOVA_SPAWN_MULTIPLIER;
            const flockCenter = new Vec2(bh.position.x, bh.position.y);
            const flockGroup: CircleEnemy[] = [];
            for (let ci = 0; ci < circleCount; ci++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = 60 + Math.random() * 90;
              const cPos = new Vec2(
                bh.position.x + Math.cos(angle) * dist,
                bh.position.y + Math.sin(angle) * dist,
              );
              const ce = createEnemy('circle', cPos) as CircleEnemy;
              const ejectSpeed = CIRCLE_EJECT_SPEED_MIN + Math.random() * (CIRCLE_EJECT_SPEED_MAX - CIRCLE_EJECT_SPEED_MIN);
              ce.ejectVel.set(Math.cos(angle) * ejectSpeed, Math.sin(angle) * ejectSpeed);
              ce.flockCenter = flockCenter;
              lifecycle.spawnEnemy(ce);
              enemies.push(ce);
              flockGroup.push(ce);
            }
            this.circleFlocks.push({ center: flockCenter, members: flockGroup });
            // Layer 1: Primary supernova explosion (massive)
            explosions.spawn(
              bh.position.x, bh.position.y, bh.color,
              this.mobile ? 150 : SUPERNOVA_PARTICLE_COUNT,
              EXPLOSION_DURATION_LARGE,
            );
            // Layer 2: White flash particles
            explosions.spawn(
              bh.position.x, bh.position.y, [1, 1, 1],
              this.mobile ? 60 : Math.floor(SUPERNOVA_PARTICLE_COUNT * 0.4),
              EXPLOSION_DURATION_LARGE * 0.6,
            );
            // Layer 3: Orange embers (long duration)
            explosions.spawn(
              bh.position.x, bh.position.y, [1, 0.5, 0.1],
              this.mobile ? 40 : Math.floor(SUPERNOVA_PARTICLE_COUNT * 0.3),
              EXPLOSION_DURATION_LARGE * 1.5,
              0.3,
            );
            grid.applyImpulse(bh.position.x, bh.position.y, SUPERNOVA_GRID_IMPULSE, 600);
            camera.shake(SCREEN_SHAKE_DEATH);
            audio.playBlackHoleDeath(absorbed);
            player.score += bh.scoreValue;
            player.enemiesKilled++;
            this.deps.onSupernovaDetonate();
            this.supernovaWarningPlayed.delete(bh);
          }
          continue;
        }

        // Attract within radius
        if (dist2 < attractR2 && dist2 > 1) {
          const dist = Math.sqrt(dist2);
          const force = BlackHole.GRAVITY_STRENGTH * dt / dist;
          e.position.x += dx / dist * force;
          e.position.y += dy / dist * force;
        }
      }

      // Bullet gravity bending — curve trajectories near BlackHoles
      for (const b of bullets.bullets) {
        if (!b.active) continue;
        const bdx = bh.position.x - b.position.x;
        const bdy = bh.position.y - b.position.y;
        const bdist2 = bdx * bdx + bdy * bdy;
        if (bdist2 >= attractR2 || bdist2 < 1) continue;
        const bdist = Math.sqrt(bdist2);
        const force = BULLET_GRAVITY_STRENGTH * dt / bdist;
        b.velocity.x += bdx / bdist * force;
        b.velocity.y += bdy / bdist * force;
        b.angle = Math.atan2(b.velocity.y, b.velocity.x);
      }
    }
  }

  /** Pull player toward active BlackHoles */
  applyPlayerPull(dt: number): void {
    const { player, enemies } = this.deps;
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    for (const e of enemies) {
      if (!e.active || e.isSpawning || !(e instanceof BlackHole)) continue;
      const dx = e.position.x - player.position.x;
      const dy = e.position.y - player.position.y;
      const dist2 = dx * dx + dy * dy;
      const attractR = BlackHole.ATTRACT_RADIUS;
      if (dist2 < attractR * attractR && dist2 > 1) {
        const dist = Math.sqrt(dist2);
        const force = gameSettings.bhPlayerPull * (1 + e.absorbedCount * 0.08) * dt / dist;
        player.position.x += dx / dist * force;
        player.position.y += dy / dist * force;
      }
    }
    // Re-clamp player to world bounds
    if (player.position.x < -hw) player.position.x = -hw;
    if (player.position.x > hw) player.position.x = hw;
    if (player.position.y < -hh) player.position.y = -hh;
    if (player.position.y > hh) player.position.y = hh;
  }

  /** Update circle flock centroids (shared Vec2 refs held by each CircleEnemy). */
  updateFlocks(): void {
    for (let fi = this.circleFlocks.length - 1; fi >= 0; fi--) {
      const flock = this.circleFlocks[fi];
      const active = flock.members.filter(m => m.active);
      if (active.length === 0) { this.circleFlocks.splice(fi, 1); continue; }
      flock.members = active;
      let cx = 0, cy = 0;
      for (const m of active) { cx += m.position.x; cy += m.position.y; }
      flock.center.set(cx / active.length, cy / active.length);
    }
  }

  /** Return the set of non-BlackHole enemies currently within a BlackHole's attract radius */
  getEnemiesInGravityWell(): Set<Enemy> {
    const result = new Set<Enemy>();
    const attractR2 = BlackHole.ATTRACT_RADIUS * BlackHole.ATTRACT_RADIUS;
    for (const e of this.deps.enemies) {
      if (!e.active || e.isSpawning || !(e instanceof BlackHole)) continue;
      for (const other of this.deps.enemies) {
        if (!other.active || other.isSpawning || other === e || other instanceof BlackHole || other.gravityImmune) continue;
        const dx = e.position.x - other.position.x;
        const dy = e.position.y - other.position.y;
        if (dx * dx + dy * dy < attractR2) {
          result.add(other);
        }
      }
    }
    return result;
  }

  clear(): void {
    this.circleFlocks = [];
    this.supernovaWarningPlayed.clear();
  }
}

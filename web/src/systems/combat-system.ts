import type { Renderer } from '../renderer/sprite-batch';
import type { SpringMassGrid } from '../renderer/grid';
import type { ParticleField } from '../renderer/particle-field';
import type { DebrisField } from '../renderer/debris-field';
import type { Camera } from '../core/camera';
import type { AudioManager } from '../core/audio';
import { Player } from '../entities/player';
import { Enemy } from '../entities/enemies/enemy';
import type { ExplosionPool } from '../entities/explosion';
import { Mandelbrot } from '../entities/enemies/mandelbrot';
import { MiniMandel } from '../entities/enemies/minimandel';
import { BlackHole } from '../entities/enemies/blackhole';
import { Sierpinski } from '../entities/enemies/sierpinski';
import { LifecycleSystem } from './lifecycle-system';
import { createEnemy } from '../spawner/enemy-factory';
import { CollisionResult } from '../core/collision';
import { RunStats } from '../core/run-stats';
import { Vec2 } from '../core/vector';
import { EnemyType } from '../spawner/spawn-patterns';
import {
  EXPLOSION_PARTICLE_COUNT_SMALL,
  DEATH_FRAGMENT_CONE,
  EXPLOSION_PARTICLE_COUNT_LARGE,
  EXPLOSION_PARTICLE_COUNT_DEATH,
  EXPLOSION_DURATION_DEFAULT,
  EXPLOSION_DURATION_LARGE,
  EXPLOSION_DURATION_DEATH,
  SCREEN_SHAKE_SMALL,
  SCREEN_SHAKE_LARGE,
  SCREEN_SHAKE_DEATH,
  HITSTOP_SIERPINSKI,
  HITSTOP_BLACKHOLE,
  HITSTOP_MULTI,
  HITSTOP_ELITE,
  KILL_SIG_DURATION,
  KILL_SIG_RAY_COUNT,
  KILL_SIG_RAY_LENGTH,
  HEAT_DECAY_RATE,
  HEAT_KILL_BASE,
  HEAT_KILL_ELITE,
  HEAT_KILL_BLACKHOLE,
  HEAT_DENSE_COMBAT_BONUS,
  HEAT_SURVIVAL_RATE,
  MINIBOSS_HEAT_ON_DEATH,
  MINIBOSS_HITSTOP_DEATH,
  DIFFICULTY_PHASES,
  SHATTER_IMPACT_SPEED,
} from '../config';

interface KillEffect {
  x: number;
  y: number;
  color: [number, number, number];
  family: string;
  elapsed: number;
  duration: number;
  angles: number[];
}

interface PendingSpawn {
  type: EnemyType;
  position: Vec2;
  delay: number;
  origin: Vec2;
}

export interface CombatSystemDeps {
  player: Player;
  runStats: RunStats;
  enemies: Enemy[];
  lifecycle: LifecycleSystem;
  audio: AudioManager;
  explosions: ExplosionPool;
  field: ParticleField;
  debris: DebrisField;
  grid: SpringMassGrid;
  camera: Camera;
  onMinibossDefeated: () => void;
  onSierpinskiBossDefeated: () => void;
}

/** RGB triplet (0..1) → HSL hue in degrees, for tinting impact sparklets by unit colour. */
function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export class CombatSystem {
  private deps: CombatSystemDeps;
  private mobile: boolean;

  private killEffects: KillEffect[] = [];
  private pendingSpawns: PendingSpawn[] = [];
  private hitstopTimer = 0;

  private heat = 0;
  private timeSinceLastKill = 0;

  constructor(mobile: boolean, deps: CombatSystemDeps) {
    this.mobile = mobile;
    this.deps = deps;
  }

  get heatValue(): number { return this.heat; }

  bumpHeat(amount: number): void {
    this.heat = Math.min(1, this.heat + amount);
  }

  processKills(result: CollisionResult): void {
    let frameKillCount = 0;
    let maxHitstop = 0;

    for (const kill of result.killedEnemies) {
      this.deps.player.score += kill.scoreValue;
      if (kill.scoreValue > 0) this.deps.player.enemiesKilled++;
      frameKillCount++;

      const family = kill.enemy.family;
      const isEliteKill = kill.enemy.isElite;

      if (isEliteKill) this.deps.runStats.elitesKilled++;
      if (family === 'blackhole') this.deps.runStats.blackholesKilled++;
      if (family === 'mandelbrot') this.deps.runStats.minibossDefeated = true;

      // Heat
      if (family === 'mandelbrot') {
        this.heat = MINIBOSS_HEAT_ON_DEATH;
      } else if (family === 'blackhole') {
        this.heat = Math.min(1, this.heat + HEAT_KILL_BLACKHOLE);
      } else if (isEliteKill) {
        this.heat = Math.min(1, this.heat + HEAT_KILL_ELITE);
      } else {
        this.heat = Math.min(1, this.heat + HEAT_KILL_BASE);
      }
      this.timeSinceLastKill = 0;

      // Notify Mandelbrot parent when a MiniMandel dies
      if (kill.enemy instanceof MiniMandel && kill.enemy.parent && kill.enemy.parent.active) {
        kill.enemy.parent.onMinionDeath();
      }

      // Impact direction: bullet momentum drives the shatter for regular units.
      // Boss/BlackHole deaths stay radial — their stored energy dwarfs a bullet.
      const dir = kill.impactAngle;

      // Kill signature
      this.spawnKillSignature(kill.position.x, kill.position.y, kill.color, family, isEliteKill, dir);
      if (family === 'mandelbrot') {
        this.deps.audio.playMinibossDeath();
      } else {
        this.deps.audio.playKillSignature(family);
      }
      if (isEliteKill) {
        this.deps.audio.playEliteKill();
        maxHitstop = Math.max(maxHitstop, HITSTOP_ELITE);
      }

      // Per-family explosion / grid / shake / boss callbacks
      switch (family) {
        case 'mandelbrot': {
          this.deps.explosions.spawn(
            kill.position.x, kill.position.y, [1, 0.4, 0.1],
            this.mobile ? 120 : 250, EXPLOSION_DURATION_LARGE,
          );
          this.deps.explosions.spawn(
            kill.position.x, kill.position.y, [1, 1, 0.8],
            this.mobile ? 60 : 120, EXPLOSION_DURATION_DEFAULT,
          );
          this.deps.explosions.spawn(
            kill.position.x, kill.position.y, kill.color,
            this.mobile ? 40 : 80, EXPLOSION_DURATION_LARGE * 1.2, 0.3,
          );
          this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 1200, 500);
          this.deps.camera.shake(SCREEN_SHAKE_DEATH);
          maxHitstop = Math.max(maxHitstop, MINIBOSS_HITSTOP_DEATH);

          for (const e of this.deps.enemies) {
            if (e.active && e instanceof MiniMandel) {
              e.active = false;
              this.deps.explosions.spawn(e.position.x, e.position.y, e.color,
                this.mobile ? 20 : 40, EXPLOSION_DURATION_DEFAULT * 0.6);
              this.deps.grid.applyImpulse(e.position.x, e.position.y, 300, 150);
            }
          }
          this.deps.onMinibossDefeated();
          break;
        }
        case 'blackhole': {
          const absorbed = kill.enemy instanceof BlackHole ? kill.enemy.absorbedCount : 0;
          this.deps.audio.playBlackHoleDeath(absorbed);
          this.deps.explosions.spawn(
            kill.position.x, kill.position.y, kill.color,
            this.mobile ? 60 : 120, EXPLOSION_DURATION_DEFAULT,
          );
          if (absorbed > 0) {
            this.deps.explosions.spawn(
              kill.position.x, kill.position.y, kill.color,
              this.mobile ? Math.floor(absorbed * 8) : absorbed * 15,
              EXPLOSION_DURATION_LARGE * 0.8,
            );
            this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 600 + absorbed * 50, 300);
            this.deps.camera.shake(SCREEN_SHAKE_LARGE);
          } else {
            this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 500, 250);
            this.deps.camera.shake(SCREEN_SHAKE_LARGE);
          }
          maxHitstop = Math.max(maxHitstop, HITSTOP_BLACKHOLE);
          break;
        }
        case 'sierpinski': {
          const sTier = (kill.enemy instanceof Sierpinski) ? kill.enemy.tier : 2;
          if (sTier === 0) {
            this.deps.explosions.spawn(
              kill.position.x, kill.position.y, kill.color,
              this.mobile ? 80 : 160, EXPLOSION_DURATION_LARGE,
            );
            this.deps.explosions.spawn(
              kill.position.x, kill.position.y, [1, 0.9, 0.3],
              this.mobile ? 40 : 80, EXPLOSION_DURATION_DEFAULT,
            );
            this.deps.explosions.spawn(
              kill.position.x, kill.position.y, [1, 0.7, 0.1],
              this.mobile ? 30 : 60, EXPLOSION_DURATION_LARGE * 0.8, 0.3,
            );
            this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 800, 350);
            this.deps.camera.shake(SCREEN_SHAKE_DEATH);
            maxHitstop = Math.max(maxHitstop, HITSTOP_SIERPINSKI * 2);
            this.deps.onSierpinskiBossDefeated();
          } else if (sTier === 1) {
            const shattered = this.emitShatter(kill.enemy, kill.position.x, kill.position.y, kill.color, dir);
            this.deps.explosions.spawn(
              kill.position.x, kill.position.y, kill.color,
              shattered ? (this.mobile ? 8 : 16) : (this.mobile ? 40 : 80),
              EXPLOSION_DURATION_DEFAULT, 1, dir,
            );
            this.deps.explosions.spawn(
              kill.position.x, kill.position.y, [1, 0.9, 0.3],
              this.mobile ? 20 : 40, EXPLOSION_DURATION_DEFAULT * 0.7, 1, dir,
            );
            this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 500, 220);
            this.deps.camera.shake(SCREEN_SHAKE_LARGE);
            maxHitstop = Math.max(maxHitstop, HITSTOP_SIERPINSKI);
          } else {
            const shattered = this.emitShatter(kill.enemy, kill.position.x, kill.position.y, kill.color, dir);
            this.deps.explosions.spawn(
              kill.position.x, kill.position.y, kill.color,
              shattered ? (this.mobile ? 6 : 12) : (this.mobile ? 25 : 50),
              EXPLOSION_DURATION_DEFAULT * 0.8, 1, dir,
            );
            this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 350, 150);
          }
          break;
        }
        case 'pinwheel': {
          const shattered = this.emitShatter(kill.enemy, kill.position.x, kill.position.y, kill.color, dir);
          this.deps.explosions.spawn(
            kill.position.x, kill.position.y, kill.color,
            shattered ? (this.mobile ? 5 : 10) : (this.mobile ? 30 : 60),
            EXPLOSION_DURATION_DEFAULT * 0.8, 1.3, dir,
          );
          this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 350, 180);
          break;
        }
        case 'circle': {
          // Circles are dusty ejecta of a BlackHole: killing one throws off a puff of
          // gold hit-sparks (velocity-stretched via the dust field) in the bullet's
          // direction, like shooting the hole itself — plus a small blue dust burst.
          this.deps.field.spawnBurst(kill.position.x, kill.position.y, dir ?? 0, 1.6, this.mobile ? 12 : 22, 6.5, 42, 0.5);
          this.deps.field.spawnBurst(kill.position.x, kill.position.y, dir ?? 0, 2.6, this.mobile ? 7 : 14, 2.8, 205, 0.6);
          this.deps.explosions.spawn(
            kill.position.x, kill.position.y, kill.color,
            this.mobile ? 8 : 16, EXPLOSION_DURATION_DEFAULT * 0.7, 1.2, dir,
          );
          this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 240, 130);
          break;
        }
        default: {
          // Regular units break into their own geometry (shards) — the "box" particle
          // cloud is replaced by a flash + the tumbling edges. Ring units keep the cloud.
          const shattered = this.emitShatter(kill.enemy, kill.position.x, kill.position.y, kill.color, dir);
          this.deps.explosions.spawn(
            kill.position.x, kill.position.y, kill.color,
            shattered
              ? (this.mobile ? 4 : 8)
              : (this.mobile ? Math.floor(EXPLOSION_PARTICLE_COUNT_SMALL * 0.6) : EXPLOSION_PARTICLE_COUNT_SMALL),
            EXPLOSION_DURATION_DEFAULT, 1, dir,
          );
          this.deps.grid.applyImpulse(kill.position.x, kill.position.y, 400, 200);
          break;
        }
      }

      // Children
      const deathResult = kill.enemy.onDeath();
      if (deathResult.spawnEnemies) {
        if (deathResult.staggeredSpawn) {
          const origin = kill.position.clone();
          this.deps.explosions.spawn(
            origin.x, origin.y, kill.color,
            this.mobile ? 30 : 60, 0.6,
          );
          this.deps.camera.shake(SCREEN_SHAKE_SMALL);
          for (let i = 0; i < deathResult.spawnEnemies.length; i++) {
            const child = deathResult.spawnEnemies[i];
            this.pendingSpawns.push({
              type: child.type,
              position: child.position.clone(),
              delay: 300 + i * 120,
              origin,
            });
          }
        } else {
          for (const child of deathResult.spawnEnemies) {
            const ce = createEnemy(child.type, child.position, false, child.tier);
            this.deps.lifecycle.spawnEnemy(ce);
            this.deps.enemies.push(ce);
          }
        }
      }
    }

    if (frameKillCount >= 3) {
      maxHitstop = Math.max(maxHitstop, HITSTOP_MULTI);
      this.heat = Math.min(1, this.heat + HEAT_DENSE_COMBAT_BONUS * frameKillCount);
    }
    if (maxHitstop > 0) {
      this.hitstopTimer = maxHitstop;
    }
  }

  /** Update timers: kill effects, heat decay/survival, and process ready staggered spawns. */
  update(dt: number, gameTime: number): void {
    // Kill effects
    const dtSec = dt / 1000;
    for (const ke of this.killEffects) {
      ke.elapsed += dtSec;
    }
    this.killEffects = this.killEffects.filter(ke => ke.elapsed < ke.duration);

    // Heat
    this.timeSinceLastKill += dtSec;
    if (this.timeSinceLastKill > 2) {
      this.heat = Math.max(0, this.heat - HEAT_DECAY_RATE * dtSec);
    }
    if (gameTime >= DIFFICULTY_PHASES.intense.start) {
      this.heat = Math.min(1, this.heat + HEAT_SURVIVAL_RATE * dtSec);
    }

    // Staggered child spawns
    for (const ps of this.pendingSpawns) {
      ps.delay -= dt;
      if (ps.delay <= 0) {
        const ce = createEnemy(ps.type, ps.position);
        this.deps.lifecycle.spawnEnemy(ce);
        this.deps.enemies.push(ce);
        this.deps.explosions.spawn(ps.position.x, ps.position.y, [1, 0.6, 0.2], 12, 0.3);
        this.deps.grid.applyImpulse(ps.position.x, ps.position.y, 200, 150);
      }
    }
    if (this.pendingSpawns.length > 0) {
      const origin = this.pendingSpawns[0].origin;
      this.deps.grid.applyImpulse(origin.x, origin.y, 120, 200);
    }
    this.pendingSpawns = this.pendingSpawns.filter(ps => ps.delay > 0);
  }

  render(renderer: Renderer): void {
    for (const ke of this.killEffects) {
      const t = ke.elapsed / ke.duration;
      const alpha = Math.max(0, 1 - t);
      const [r, g, b] = ke.color;

      switch (ke.family) {
        case 'rhombus': {
          for (const angle of ke.angles) {
            const len = t * KILL_SIG_RAY_LENGTH;
            const innerLen = len * 0.3;
            const x1 = ke.x + Math.cos(angle) * innerLen;
            const y1 = ke.y + Math.sin(angle) * innerLen;
            const x2 = ke.x + Math.cos(angle) * len;
            const y2 = ke.y + Math.sin(angle) * len;
            renderer.drawLine(x1, y1, x2, y2, 1, 1, 1, alpha * 0.8);
            const x3 = ke.x + Math.cos(angle) * len * 1.2;
            const y3 = ke.y + Math.sin(angle) * len * 1.2;
            renderer.drawLine(x2, y2, x3, y3, r, g, b, alpha * 0.4);
          }
          break;
        }
        case 'pinwheel': {
          const spiralRot = t * Math.PI * 3;
          for (let i = 0; i < ke.angles.length; i++) {
            const angle = ke.angles[i] + spiralRot;
            const dist = t * 70;
            const x1 = ke.x + Math.cos(angle) * dist;
            const y1 = ke.y + Math.sin(angle) * dist;
            const trail = 12;
            const x2 = ke.x + Math.cos(angle - 0.3) * (dist - trail);
            const y2 = ke.y + Math.sin(angle - 0.3) * (dist - trail);
            renderer.drawLine(x1, y1, x2, y2, r, g, b, alpha * 0.7);
            renderer.drawLine(x1, y1, x1 + Math.cos(angle) * 4, y1 + Math.sin(angle) * 4, 1, 1, 1, alpha * 0.5);
          }
          break;
        }
        case 'sierpinski': {
          for (let layer = 0; layer < 3; layer++) {
            const layerT = Math.max(0, t - layer * 0.1);
            if (layerT <= 0) continue;
            const layerAlpha = alpha * (1 - layer * 0.25);
            const radius = layerT * 50 + layer * 15;
            const rot = t * 1.5 + layer * Math.PI / 6;
            for (let j = 0; j < 3; j++) {
              const a1 = rot + (j / 3) * Math.PI * 2;
              const a2 = rot + ((j + 1) / 3) * Math.PI * 2;
              renderer.drawLine(
                ke.x + Math.cos(a1) * radius, ke.y + Math.sin(a1) * radius,
                ke.x + Math.cos(a2) * radius, ke.y + Math.sin(a2) * radius,
                r, g, b, layerAlpha * 0.6,
              );
            }
          }
          break;
        }
        case 'mandelbrot': {
          for (let layer = 0; layer < 5; layer++) {
            const layerT = Math.max(0, t - layer * 0.06);
            if (layerT <= 0) continue;
            const layerAlpha = alpha * (1 - layer * 0.15);
            const radius = layerT * 120 + layer * 20;
            const rot = t * 2 + layer * Math.PI / 5;
            const segs = 20;
            for (let j = 0; j < segs; j++) {
              const theta1 = rot + (j / segs) * Math.PI * 2;
              const theta2 = rot + ((j + 1) / segs) * Math.PI * 2;
              const r1 = (1 - Math.cos(theta1)) * radius * 0.5;
              const r2 = (1 - Math.cos(theta2)) * radius * 0.5;
              renderer.drawLine(
                ke.x + Math.cos(theta1) * r1, ke.y + Math.sin(theta1) * r1,
                ke.x + Math.cos(theta2) * r2, ke.y + Math.sin(theta2) * r2,
                layer < 2 ? 1 : r, layer < 2 ? 0.8 : g, layer < 2 ? 0.3 : b, layerAlpha * 0.5,
              );
            }
          }
          for (const angle of ke.angles) {
            const len = t * 150;
            const x1 = ke.x + Math.cos(angle) * 20;
            const y1 = ke.y + Math.sin(angle) * 20;
            const x2 = ke.x + Math.cos(angle) * len;
            const y2 = ke.y + Math.sin(angle) * len;
            renderer.drawLine(x1, y1, x2, y2, 1, 1, 1, alpha * 0.6);
          }
          break;
        }
      }
    }
  }

  clear(): void {
    this.killEffects = [];
    this.pendingSpawns = [];
    this.hitstopTimer = 0;
    this.heat = 0;
    this.timeSinceLastKill = 0;
  }

  /** Consume current hitstop and reset it. Game applies the value to its own timer. */
  consumeHitstop(): number {
    const v = this.hitstopTimer;
    this.hitstopTimer = 0;
    return v;
  }

  /** Peak-heat tracking for run stats is kept in Game; this allows it to observe changes. */
  resetHeat(): void {
    this.heat = 0;
    this.timeSinceLastKill = 0;
  }

  clearPendingSpawns(): void {
    this.pendingSpawns = [];
  }

  /**
   * Break a killed polygonal unit along its own wireframe edges into tumbling geometry
   * shards, plus a small forward spark puff. Returns true when the unit had geometry to
   * shatter (rhombus/pinwheel/shard/…) so the caller can drop the generic particle cloud;
   * false for ring units (circles) that have no edges — those keep their normal burst.
   */
  private emitShatter(
    enemy: Enemy, x: number, y: number, color: [number, number, number], dir: number | undefined,
  ): boolean {
    const pts = enemy.getWorldPoints();
    if (pts.length < 3) return false;
    const moving = enemy.velocity.x * enemy.velocity.x + enemy.velocity.y * enemy.velocity.y > 0.0001;
    const angle = dir ?? (moving ? Math.atan2(enemy.velocity.y, enemy.velocity.x) : 0);
    this.deps.debris.shatter(pts, x, y, color, angle, SHATTER_IMPACT_SPEED);
    const hue = rgbToHue(color[0], color[1], color[2]);
    this.deps.field.spawnBurst(x, y, angle, 1.1, this.mobile ? 4 : 7, 4.0, hue, 0.4);
    return true;
  }

  private spawnKillSignature(
    x: number, y: number, color: [number, number, number],
    family: string, isElite = false, direction?: number,
  ): void {
    if (family === 'rhombus' || family === 'pinwheel' || family === 'sierpinski' || family === 'mandelbrot') {
      const baseCount = family === 'pinwheel' ? 8 : KILL_SIG_RAY_COUNT;
      const count = isElite ? Math.floor(baseCount * 1.5) : baseCount;
      // Bullet kills: rays fan forward with the fragments (momentum). Bosses stay radial.
      const fan = direction !== undefined && family !== 'mandelbrot';
      const rayAngles = (phaseOffset: number): number[] => {
        const angles: number[] = [];
        for (let i = 0; i < count; i++) {
          if (fan) {
            const t = count === 1 ? 0.5 : i / (count - 1);
            angles.push(direction! + (t - 0.5) * 2 * DEATH_FRAGMENT_CONE + phaseOffset * 0.5 + (Math.random() - 0.5) * 0.12);
          } else {
            angles.push(phaseOffset + (i / count) * Math.PI * 2);
          }
        }
        return angles;
      };
      const baseAngle = fan ? 0 : Math.random() * Math.PI * 2;
      this.killEffects.push({
        x, y,
        color: isElite ? [1, 1, 0.7] : color,
        family,
        elapsed: 0,
        duration: isElite ? KILL_SIG_DURATION * 1.3 : KILL_SIG_DURATION,
        angles: rayAngles(baseAngle),
      });
      if (isElite) {
        this.killEffects.push({
          x, y, color, family,
          elapsed: 0,
          duration: KILL_SIG_DURATION * 1.5,
          angles: rayAngles(baseAngle + Math.PI / count),
        });
      }
    }
  }
}

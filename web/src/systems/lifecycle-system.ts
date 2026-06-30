import { TrailSystem } from '../renderer/trails';
import { Enemy } from '../entities/enemies/enemy';
import { Bullet, BulletPool } from '../entities/bullet';
import {
  BULLET_COLOR,
  TRAIL_LENGTH_ENEMY,
  TRAIL_LENGTH_BULLET,
  MOBILE_TRAIL_LENGTH_ENEMY,
  MOBILE_TRAIL_LENGTH_BULLET,
} from '../config';
import { gameSettings } from '../settings';

/**
 * Centralizes entity lifecycle concerns:
 * - Trail registration / unregistration for enemies and bullets
 * - Cleanup of inactive entities
 *
 * Keeping this logic in one place removes the scattered manual trail
 * bookkeeping that previously lived in game.ts.
 */
export class LifecycleSystem {
  private trails: TrailSystem;
  private trailLenEnemy: number;
  private trailLenBullet: number;

  constructor(mobile: boolean) {
    this.trails = new TrailSystem();
    this.trailLenEnemy = mobile ? MOBILE_TRAIL_LENGTH_ENEMY : TRAIL_LENGTH_ENEMY;
    this.trailLenBullet = mobile ? MOBILE_TRAIL_LENGTH_BULLET : TRAIL_LENGTH_BULLET;
  }

  get trailSystem(): TrailSystem {
    return this.trails;
  }

  /** Register a trail for a newly-spawned enemy. Safe to call multiple times. */
  spawnEnemy(enemy: Enemy): void {
    if (enemy.trailId >= 0) {
      this.trails.unregister(enemy.trailId);
    }
    enemy.trailId = this.trails.register(enemy.color, this.trailLenEnemy);
  }

  /** Register a trail for a newly-spawned bullet. Safe to call multiple times. */
  spawnBullet(bullet: Bullet): void {
    if (bullet.trailId >= 0) {
      this.trails.unregister(bullet.trailId);
    }
    bullet.trailId = this.trails.register(BULLET_COLOR, this.trailLenBullet);
  }

  /**
   * Update active enemy trails and unregister/remove inactive enemies in one pass.
   * Filters the array IN PLACE (and returns the same reference) so systems that hold
   * a reference to the enemies array stay in sync with the game.
   */
  cleanupEnemies(enemies: Enemy[]): Enemy[] {
    let w = 0;
    for (let r = 0; r < enemies.length; r++) {
      const e = enemies[r];
      if (e.active && e.trailId >= 0) {
        this.trails.update(e.trailId, e.position.x, e.position.y);
      } else if (!e.active && e.trailId >= 0) {
        this.trails.unregister(e.trailId);
        e.trailId = -1;
      }
      if (e.active) enemies[w++] = e;
    }
    enemies.length = w;
    return enemies;
  }

  /** Update active bullet trails and unregister trails for inactive bullets. */
  updateBulletTrails(bullets: BulletPool): void {
    for (const b of bullets.bullets) {
      if (b.active && b.trailId >= 0) {
        this.trails.update(b.trailId, b.position.x, b.position.y);
      } else if (!b.active && b.trailId >= 0) {
        this.trails.unregister(b.trailId);
        b.trailId = -1;
      }
    }
  }

  /** Clear every trail. Use on full reset (game start / game over). */
  clear(): void {
    this.trails.clear();
  }

  /** Clear only bullet trails. Use on player death so old bullet trails vanish during slowmo. */
  clearBulletTrails(bullets: BulletPool): void {
    for (const b of bullets.bullets) {
      if (b.trailId >= 0) {
        this.trails.unregister(b.trailId);
        b.trailId = -1;
      }
    }
  }

  /** Recompute trail lengths from current settings. */
  applyVisualSettings(mobile: boolean): void {
    this.trailLenEnemy = mobile
      ? Math.min(gameSettings.trailLength, MOBILE_TRAIL_LENGTH_ENEMY)
      : gameSettings.trailLength;
    this.trailLenBullet = mobile
      ? MOBILE_TRAIL_LENGTH_BULLET
      : Math.min(gameSettings.trailLength, TRAIL_LENGTH_BULLET);
  }
}

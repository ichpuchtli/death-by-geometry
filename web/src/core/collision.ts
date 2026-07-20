import { Player } from '../entities/player';
import { Bullet } from '../entities/bullet';
import { Enemy } from '../entities/enemies/enemy';
import { Vec2 } from './vector';
import { BULLET_COLLISION_RADIUS_ENEMY } from '../config';
import { gameSettings } from '../settings';

export interface CollisionResult {
  killedEnemies: {
    enemy: Enemy;
    position: Vec2;
    color: [number, number, number];
    scoreValue: number;
    /** Impact direction (rad): the killing bullet's travel direction (or the enemy's own
     *  momentum on contact kills). Death fragments fan forward along it. Undefined → radial. */
    impactAngle?: number;
  }[];
  /** Non-killing hits on multi-hit bosses (`Enemy.bossFeedback`) — drive damage feedback.
   *  Optional so callers that build a result by hand (debug kill hooks) can omit it. */
  bossHits?: {
    enemy: Enemy;
    /** Bullet contact point (where the spark should erupt). */
    position: Vec2;
    /** Bullet travel direction (rad) — sparks fan off the far side of the impact. */
    bulletAngle: number;
    /** Boss HP fraction (hp/maxHp) BEFORE this hit — for milestone-crossing detection. */
    fracBefore: number;
  }[];
  /** Every bullet impact on a blackhole-family unit (damage AND absorb) — drives the
   *  per-hit thud. BlackHoles are not `bossFeedback` units, so they get their own list.
   *  Optional so callers that build a result by hand (debug kill hooks) can omit it. */
  blackholeHits?: {
    /** Bullet contact point. */
    position: Vec2;
    /** Impact direction (rad): from the hole's center toward the bullet at contact. */
    bulletAngle: number;
  }[];
  playerHit: boolean;
}

export function checkCollisions(
  player: Player,
  bullets: Bullet[],
  enemies: Enemy[],
): CollisionResult {
  const result: CollisionResult = {
    killedEnemies: [],
    bossHits: [],
    blackholeHits: [],
    playerHit: false,
  };

  // Bullet vs Enemy (with onBulletHit for reflect/absorb/damage)
  for (const b of bullets) {
    if (!b.active) continue;
    for (const e of enemies) {
      if (!e.active || (e.isSpawning && !gameSettings.vulnerableDuringSpawn)) continue;
      if (b.position.distanceToSq(e.position) < BULLET_COLLISION_RADIUS_ENEMY * BULLET_COLLISION_RADIUS_ENEMY) {
        const bulletAngle = Math.atan2(b.position.y - e.position.y, b.position.x - e.position.x);
        const reaction = e.onBulletHit(bulletAngle);

        if (e.family === 'blackhole') {
          // Per-hit thud (absorb + damage alike) — played (rate-limited) by CombatSystem.
          result.blackholeHits!.push({ position: b.position.clone(), bulletAngle });
        }

        if (reaction === 'reflect') {
          // Bounce bullet back — don't deactivate, don't damage
          b.velocity.x *= -1;
          b.velocity.y *= -1;
          b.angle = Math.atan2(b.velocity.y, b.velocity.x);
          break;
        }

        if (reaction === 'absorb') {
          // Consume bullet, no damage
          b.active = false;
          break;
        }

        // reaction === 'damage' — normal behavior
        b.active = false;
        const fracBefore = e.maxHp > 1 ? e.hp / e.maxHp : 0;
        const contactX = b.position.x;
        const contactY = b.position.y;
        const travelAngle = Math.atan2(b.velocity.y, b.velocity.x);
        const killed = e.hit();
        if (killed) {
          result.killedEnemies.push({
            enemy: e,
            position: e.position.clone(),
            color: e.color,
            scoreValue: e.scoreValue,
            // Fragments inherit the bullet's momentum — shatter away from the shooter
            impactAngle: travelAngle,
          });
        } else if (e.bossFeedback) {
          // Survived the hit — feed the shared boss damage-feedback layer.
          result.bossHits!.push({
            enemy: e,
            position: new Vec2(contactX, contactY),
            bulletAngle: travelAngle,
            fracBefore,
          });
        }
        break;
      }
    }
  }

  // Player vs Enemy
  if (!player.isInvulnerable && player.active) {
    for (const e of enemies) {
      if (!e.active || (e.isSpawning && !gameSettings.vulnerableDuringSpawn)) continue;
      const dist = player.position.distanceToSq(e.position);
      const minDist = player.collisionRadius + e.collisionRadius;
      if (dist < minDist * minDist) {
        result.playerHit = true;
        // Miniboss survives player collision — player dies, boss lives
        if (!e.isMiniboss) {
          e.active = false;
          const speed2 = e.velocity.x * e.velocity.x + e.velocity.y * e.velocity.y;
          result.killedEnemies.push({
            enemy: e,
            position: e.position.clone(),
            color: e.color,
            scoreValue: 0, // no score for enemies that kill you
            // Contact kill: fragments carry the enemy's own momentum through the player
            impactAngle: speed2 > 0.0001 ? Math.atan2(e.velocity.y, e.velocity.x) : undefined,
          });
        }
        break;
      }
    }
  }

  return result;
}

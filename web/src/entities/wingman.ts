import { Vec2 } from '../core/vector';
import type { Renderer } from '../renderer/sprite-batch';
import type { Bot } from '../ai/bot';
import type { EnemyView } from '../ai/observation';
import {
  PLAYER_SPEED,
  PLAYER_COLLISION_RADIUS,
  PLAYER_SHIP_SCALE,
  PLAYER_ROTATION_LERP,
  WINGMAN_SHIP_COLOR,
  WINGMAN_SHIP_COLOR2,
  WINGMAN_SHIP_FILL_COLOR,
  WINGMAN_SHIP_FILL_ALPHA,
  WINGMAN_SPAWN_OFFSET,
  WEAPON_STAGES,
} from '../config';
import { gameSettings } from '../settings';

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// Same claw/pincer silhouette as the player ship (facing right at angle=0).
const SHIP_VERTS: [number, number][] = [
  [ 1.4,  0.55],
  [ 0.5,  0.85],
  [-0.4,  0.6],
  [-1.0,  0.3],
  [-0.6,  0.0],
  [-1.0, -0.3],
  [-0.4, -0.6],
  [ 0.5, -0.85],
  [ 1.4, -0.55],
];

/**
 * An AI-controlled ally that fights beside the human player. It runs the same trained
 * policy as the takeover bot, but observes and acts from its own position, so it dodges
 * and shoots independently. Its bullets go into the shared bullet pool, so kills score
 * for the team. It is a non-colliding helper (cannot be killed) — a wingman, not a rival.
 */
export class Wingman {
  readonly position = new Vec2(0, 0);
  readonly velocity = new Vec2(0, 0);
  active = true;
  collisionRadius = PLAYER_COLLISION_RADIUS;
  facingAngle = 0;
  aimAngle = 0;
  shotTimer = 0;
  private firing = false;

  constructor(private bot: Bot) {}

  /** Position the wingman just to the side of the player (on spawn / respawn). */
  spawnBeside(px: number, py: number): void {
    this.position.set(px - WINGMAN_SPAWN_OFFSET, py);
    this.velocity.set(0, 0);
    this.facingAngle = 0;
    this.shotTimer = 0;
    this.firing = false;
    this.active = true;
  }

  update(dt: number, enemies: EnemyView[], arenaW: number, arenaH: number): void {
    if (!this.active) return;

    const a = this.bot.computeAction(this, enemies, arenaW, arenaH);

    const speed = PLAYER_SPEED * gameSettings.playerSpeedMultiplier;
    this.velocity.set(a.moveX * speed, a.moveY * speed);
    this.position.addScaledMut(this.velocity, dt);

    // Clamp to world bounds
    const hw = arenaW / 2;
    const hh = arenaH / 2;
    if (this.position.x < -hw) this.position.x = -hw;
    if (this.position.x > hw) this.position.x = hw;
    if (this.position.y < -hh) this.position.y = -hh;
    if (this.position.y > hh) this.position.y = hh;

    // Facing follows movement direction
    const mag = Math.sqrt(a.moveX * a.moveX + a.moveY * a.moveY);
    if (mag > 0.01) {
      const targetAngle = Math.atan2(a.moveY, a.moveX);
      const t = 1 - Math.pow(1 - PLAYER_ROTATION_LERP, dt);
      this.facingAngle = lerpAngle(this.facingAngle, targetAngle, t);
    }

    this.aimAngle = a.aimAngle;
    this.firing = a.fire;
    if (this.shotTimer > 0) this.shotTimer -= dt;
  }

  /** Ready-to-fire check. Shares the player's weapon stage so it upgrades with the run. */
  tryShoot(stage: typeof WEAPON_STAGES[number]): number[] | null {
    if (!this.firing || this.shotTimer > 0) return null;
    this.shotTimer = stage.shotDelay / gameSettings.fireRateMultiplier;
    return stage.angleOffsets.map(offset => this.aimAngle + (offset * Math.PI) / 180);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;

    const s = PLAYER_SHIP_SCALE;
    const cos = Math.cos(this.facingAngle);
    const sin = Math.sin(this.facingAngle);
    const px = this.position.x;
    const py = this.position.y;

    const wx: number[] = [];
    const wy: number[] = [];
    for (const [lx, ly] of SHIP_VERTS) {
      wx.push(px + (lx * cos - ly * sin) * s);
      wy.push(py + (lx * sin + ly * cos) * s);
    }

    // Fill: triangle fan from rear center (index 4)
    const cx = wx[4], cy = wy[4];
    for (let i = 0; i < SHIP_VERTS.length - 1; i++) {
      renderer.drawTriangle(
        cx, cy, wx[i], wy[i], wx[i + 1], wy[i + 1],
        WINGMAN_SHIP_FILL_COLOR[0], WINGMAN_SHIP_FILL_COLOR[1], WINGMAN_SHIP_FILL_COLOR[2],
        WINGMAN_SHIP_FILL_ALPHA,
      );
    }

    // Outer line (darker)
    for (let i = 0; i < SHIP_VERTS.length - 1; i++) {
      renderer.drawLine(
        wx[i], wy[i], wx[i + 1], wy[i + 1],
        WINGMAN_SHIP_COLOR2[0], WINGMAN_SHIP_COLOR2[1], WINGMAN_SHIP_COLOR2[2],
      );
    }

    // Bright outline
    for (let i = 0; i < SHIP_VERTS.length - 1; i++) {
      renderer.drawLine(
        wx[i], wy[i], wx[i + 1], wy[i + 1],
        WINGMAN_SHIP_COLOR[0], WINGMAN_SHIP_COLOR[1], WINGMAN_SHIP_COLOR[2],
      );
    }
  }
}

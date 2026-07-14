import { Entity } from './entity';
import { Vec2 } from '../core/vector';
import type { InputSource } from '../core/input';
import type { Renderer } from '../renderer/sprite-batch';
import {
  PLAYER_SPEED,
  PLAYER_COLLISION_RADIUS,
  PLAYER_STARTING_LIVES,
  PLAYER_INVULN_DURATION,
  PLAYER_SHIP_SCALE,
  PLAYER_ROTATION_LERP,
  PLAYER_SHIP_COLOR,
  PLAYER_SHIP_COLOR2,
  PLAYER_SHIP_FILL_COLOR,
  PLAYER_SHIP_FILL_ALPHA,
  PLAYER_RECOIL_BASE,
  PLAYER_RECOIL_PER_PELLET,
  PLAYER_RECOIL_DECAY,
  PLAYER_MUZZLE_FLASH_LENGTH,
  PLAYER_MUZZLE_FLASH_PER_PELLET,
  WEAPON_STAGES,
} from '../config';
import { gameSettings } from '../settings';

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  // Normalize to [-PI, PI]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// "Wraith" — stealth chevron silhouette (unit scale, facing right at angle=0).
// Closed loop; picked in the Player Design Lab (?player=1) to replace the old claw.
const SHIP_VERTS: [number, number][] = [
  [ 1.55,  0.0 ],  // 0: nose
  [ 0.6,   0.15],  // 1: fore shoulder
  [-0.2,   0.55],  // 2: mid wing
  [-1.12,  0.88],  // 3: swept wingtip
  [-0.6,   0.2 ],  // 4: inner wing notch
  [-0.88,  0.0 ],  // 5: rear center
  [-0.6,  -0.2 ],  // 6: inner wing notch (mirror)
  [-1.12, -0.88],  // 7: swept wingtip (mirror)
  [-0.2,  -0.55],  // 8: mid wing (mirror)
  [ 0.6,  -0.15],  // 9: fore shoulder (mirror)
];

export class Player extends Entity {
  lives = PLAYER_STARTING_LIVES;
  score = 0;
  enemiesKilled = 0;
  shooting = false;
  shotTimer = 0;
  invulnTimer = 0;
  aimAngle = 0;
  facingAngle = 0;
  fireRateOverride = 1; // multiplied with gameSettings.fireRateMultiplier
  private slowTimer = 0;
  private slowFactor = 1;
  // Recoil: set by kickRecoil() when a blast fires, decays over PLAYER_RECOIL_DECAY ms.
  private recoilTimer = 0;
  private recoilMax = 0;
  private recoilFlashLen = 0;

  constructor(private input: InputSource) {
    super();
    this.collisionRadius = PLAYER_COLLISION_RADIUS;
  }

  get isInvulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  getWeaponStage(): typeof WEAPON_STAGES[number] {
    let stage = WEAPON_STAGES[0];
    for (const s of WEAPON_STAGES) {
      if (this.score >= s.score) stage = s;
    }
    return stage;
  }

  reset(): void {
    this.position.set(0, 0);
    this.velocity.set(0, 0);
    this.lives = PLAYER_STARTING_LIVES;
    this.score = 0;
    this.enemiesKilled = 0;
    this.shooting = false;
    this.shotTimer = 0;
    this.invulnTimer = PLAYER_INVULN_DURATION;
    this.active = true;
    this.facingAngle = 0;
    this.fireRateOverride = 1;
  }

  respawn(): void {
    this.position.set(0, 0);
    this.velocity.set(0, 0);
    this.invulnTimer = PLAYER_INVULN_DURATION;
    this.shooting = false;
    this.shotTimer = 0;
    this.facingAngle = 0;
  }

  update(dt: number): void {
    if (!this.active) return;

    // Invulnerability countdown
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    // Slow timer countdown
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }

    // Movement
    const dir = this.input.getMovementDir();
    const speed = PLAYER_SPEED * gameSettings.playerSpeedMultiplier * this.slowFactor;
    this.velocity.set(dir.x * speed, dir.y * speed);
    this.move(dt);

    // Clamp to world bounds
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    if (this.position.x < -hw) this.position.x = -hw;
    if (this.position.x > hw) this.position.x = hw;
    if (this.position.y < -hh) this.position.y = -hh;
    if (this.position.y > hh) this.position.y = hh;

    // Facing angle follows movement direction
    const mag = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
    if (mag > 0.01) {
      const targetAngle = Math.atan2(dir.y, dir.x);
      const t = 1 - Math.pow(1 - PLAYER_ROTATION_LERP, dt);
      this.facingAngle = lerpAngle(this.facingAngle, targetAngle, t);
    }

    // Aim angle: desktop computes from mouse world position, touch from right stick
    this.input.updateAimFromPlayer(this.position);
    this.aimAngle = this.input.getAimAngle();

    // Shooting
    this.shooting = this.input.isMouseDown();
    if (this.shotTimer > 0) this.shotTimer -= dt;

    // Recoil spring-back
    if (this.recoilTimer > 0) this.recoilTimer -= dt;
  }

  /** Kick the ship backward + arm the muzzle flash; scales with pellet count. */
  kickRecoil(pellets: number): void {
    const extra = Math.max(0, pellets - 2);
    this.recoilMax = PLAYER_RECOIL_BASE + extra * PLAYER_RECOIL_PER_PELLET;
    this.recoilFlashLen = PLAYER_MUZZLE_FLASH_LENGTH + extra * PLAYER_MUZZLE_FLASH_PER_PELLET;
    this.recoilTimer = PLAYER_RECOIL_DECAY;
  }

  /** Check if ready to fire, and reset shot timer. Returns aim angles to fire at. */
  tryShoot(): number[] | null {
    if (!this.shooting || this.shotTimer > 0) return null;
    const stage = this.getWeaponStage();
    this.shotTimer = stage.shotDelay / (gameSettings.fireRateMultiplier * this.fireRateOverride);
    return stage.angleOffsets.map(offset => this.aimAngle + (offset * Math.PI) / 180);
  }

  applySlow(factor: number, duration: number): void {
    this.slowFactor = factor;
    this.slowTimer = duration * 1000; // convert seconds to ms
  }

  render(renderer: Renderer): void {
    if (!this.active) return;

    // Blink when invulnerable
    if (this.isInvulnerable && Math.floor(this.invulnTimer / 100) % 2 === 0) return;

    const s = PLAYER_SHIP_SCALE;
    const cos = Math.cos(this.facingAngle);
    const sin = Math.sin(this.facingAngle);

    // Recoil: displace the whole ship backward along the aim vector, springing back.
    const recoilFrac = this.recoilTimer > 0 ? this.recoilTimer / PLAYER_RECOIL_DECAY : 0;
    const recoil = this.recoilMax * recoilFrac;
    const aimCos = Math.cos(this.aimAngle);
    const aimSin = Math.sin(this.aimAngle);
    const px = this.position.x - aimCos * recoil;
    const py = this.position.y - aimSin * recoil;

    // Muzzle flash: a "Ring Pop" — an expanding ring at the barrel that blooms on each
    // shot (chosen in the Player Design Lab). recoilFlashLen scales the ring with pellets.
    if (recoilFrac > 0) {
      const bx = px + aimCos * s * 1.5;
      const by = py + aimSin * s * 1.5;
      const rad = (this.recoilFlashLen * 0.35) + (1 - recoilFrac) * this.recoilFlashLen;
      renderer.drawCircle(bx, by, rad, [1.0, 1.0, 0.9], 18, recoilFrac);
      renderer.drawCircle(bx, by, rad * 0.6, [0.7, 1.0, 0.8], 14, recoilFrac * 0.85);
    }

    // Transform local vertices to world space
    const wx: number[] = [];
    const wy: number[] = [];
    for (const [lx, ly] of SHIP_VERTS) {
      wx.push(px + (lx * cos - ly * sin) * s);
      wy.push(py + (lx * sin + ly * cos) * s);
    }
    const n = SHIP_VERTS.length;

    // Fill: triangle fan from the centroid around the closed silhouette
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += wx[i]; cy += wy[i]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      renderer.drawTriangle(
        cx, cy, wx[i], wy[i], wx[j], wy[j],
        PLAYER_SHIP_FILL_COLOR[0], PLAYER_SHIP_FILL_COLOR[1], PLAYER_SHIP_FILL_COLOR[2],
        PLAYER_SHIP_FILL_ALPHA,
      );
    }

    // Outer line (darker, for depth) — closed loop
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      renderer.drawLine(
        wx[i], wy[i], wx[j], wy[j],
        PLAYER_SHIP_COLOR2[0], PLAYER_SHIP_COLOR2[1], PLAYER_SHIP_COLOR2[2],
      );
    }

    // Main bright outline — closed loop
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      renderer.drawLine(
        wx[i], wy[i], wx[j], wy[j],
        PLAYER_SHIP_COLOR[0], PLAYER_SHIP_COLOR[1], PLAYER_SHIP_COLOR[2],
      );
    }
  }
}

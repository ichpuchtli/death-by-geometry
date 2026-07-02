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

// Claw/pincer vertices (unit scale, facing right at angle=0)
const SHIP_VERTS: [number, number][] = [
  [ 1.4,  0.55],  // 0: left prong tip
  [ 0.5,  0.85],  // 1: left prong outer
  [-0.4,  0.6],   // 2: left body
  [-1.0,  0.3],   // 3: left rear
  [-0.6,  0.0],   // 4: rear center
  [-1.0, -0.3],   // 5: right rear
  [-0.4, -0.6],   // 6: right body
  [ 0.5, -0.85],  // 7: right prong outer
  [ 1.4, -0.55],  // 8: right prong tip
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

    // Muzzle flash: a bright forward burst that blooms out of the barrel on each shot.
    if (recoilFrac > 0) {
      const mx = px + aimCos * s * 1.4;
      const my = py + aimSin * s * 1.4;
      const len = this.recoilFlashLen * recoilFrac;
      const perpCos = -aimSin, perpSin = aimCos;
      const spread = len * 0.5;
      const tipX = mx + aimCos * len, tipY = my + aimSin * len;
      // Central spike + two diverging sparks — bright cyan-white, picked up by bloom.
      renderer.drawLine(mx, my, tipX, tipY, 1.0, 1.0, 0.9);
      renderer.drawLine(mx, my, tipX + perpCos * spread, tipY + perpSin * spread, 0.7, 1.0, 0.8);
      renderer.drawLine(mx, my, tipX - perpCos * spread, tipY - perpSin * spread, 0.7, 1.0, 0.8);
    }

    // Transform local vertices to world space
    const wx: number[] = [];
    const wy: number[] = [];
    for (const [lx, ly] of SHIP_VERTS) {
      wx.push(px + (lx * cos - ly * sin) * s);
      wy.push(py + (lx * sin + ly * cos) * s);
    }

    // Fill: triangle fan from rear center (index 4) through all vertices
    const cx = wx[4], cy = wy[4];
    for (let i = 0; i < SHIP_VERTS.length - 1; i++) {
      renderer.drawTriangle(
        cx, cy, wx[i], wy[i], wx[i + 1], wy[i + 1],
        PLAYER_SHIP_FILL_COLOR[0], PLAYER_SHIP_FILL_COLOR[1], PLAYER_SHIP_FILL_COLOR[2],
        PLAYER_SHIP_FILL_ALPHA,
      );
    }

    // Outer line (darker, slightly inward offset for depth)
    for (let i = 0; i < SHIP_VERTS.length - 1; i++) {
      renderer.drawLine(
        wx[i], wy[i], wx[i + 1], wy[i + 1],
        PLAYER_SHIP_COLOR2[0], PLAYER_SHIP_COLOR2[1], PLAYER_SHIP_COLOR2[2],
      );
    }

    // Main bright outline — open polyline (gap between prong tips)
    for (let i = 0; i < SHIP_VERTS.length - 1; i++) {
      renderer.drawLine(
        wx[i], wy[i], wx[i + 1], wy[i + 1],
        PLAYER_SHIP_COLOR[0], PLAYER_SHIP_COLOR[1], PLAYER_SHIP_COLOR[2],
      );
    }
  }
}

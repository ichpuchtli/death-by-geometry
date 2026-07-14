import { BlackHole } from '../entities/enemies/blackhole';
import {
  BH_CORE_RADIUS_FRACTION,
  DARK_MATTER_CAPACITY,
  DARK_MATTER_DRAIN_PER_SECOND,
  DARK_MATTER_ENTRY_RAMP_MS,
  DARK_MATTER_EXIT_RAMP_MS,
  DARK_MATTER_HARVEST_EXPONENT,
  DARK_MATTER_HARVEST_MAX_PER_SECOND,
  DARK_MATTER_HARVEST_MIN_PER_SECOND,
  DARK_MATTER_INSUFFICIENT_FLASH_MS,
  DARK_MATTER_MIN_ACTIVATION,
  DARK_MATTER_MULTI_HOLE_BONUS_MAX,
  DARK_MATTER_TIME_SCALE,
} from '../config';

export interface TimeDilationSnapshot {
  readonly charge: number;
  readonly capacity: number;
  readonly timeScale: number;
  readonly active: boolean;
  readonly harvesting: boolean;
  readonly harvestRate: number;
  readonly coreHarvesting: boolean;
  readonly insufficientFlash: number;
}

interface TimeDilationCallbacks {
  onEnter(): void;
  onExit(): void;
  onScale(scale: number): void;
}

/** Owns the unscaled Dark Matter resource clock and smooth gameplay time scale. */
export class TimeDilationSystem {
  private _charge = 0;
  private _timeScale = 1;
  private targetActive = false;
  private _harvesting = false;
  private _harvestRate = 0;
  private _coreHarvesting = false;
  private insufficientTimer = 0;
  private heldLastFrame = false;

  constructor(private callbacks: TimeDilationCallbacks) {}

  get charge(): number { return this._charge; }
  get timeScale(): number { return this._timeScale; }
  get active(): boolean { return this.targetActive || this._timeScale < 0.999; }
  get harvesting(): boolean { return this._harvesting; }

  get snapshot(): TimeDilationSnapshot {
    return {
      charge: this._charge,
      capacity: DARK_MATTER_CAPACITY,
      timeScale: this._timeScale,
      active: this.active,
      harvesting: this._harvesting,
      harvestRate: this._harvestRate,
      coreHarvesting: this._coreHarvesting,
      insufficientFlash: this.insufficientTimer / DARK_MATTER_INSUFFICIENT_FLASH_MS,
    };
  }

  reset(): void {
    this._charge = 0;
    this.cancel(false);
    this.insufficientTimer = 0;
    this.heldLastFrame = false;
  }

  /** Cancel without an exit stinger (death/menu/visibility lifecycle). */
  cancel(playExit: boolean): void {
    if (playExit && this.active) this.callbacks.onExit();
    this.targetActive = false;
    this._timeScale = 1;
    this._harvesting = false;
    this._harvestRate = 0;
    this._coreHarvesting = false;
    this.callbacks.onScale(1);
  }

  update(realDtMs: number, held: boolean, canActivate: boolean, holes: readonly BlackHole[], playerX: number, playerY: number): number {
    const dtSec = realDtMs / 1000;
    if (this.insufficientTimer > 0) this.insufficientTimer = Math.max(0, this.insufficientTimer - realDtMs);

    // Bot control and blocked states cannot latch the action. Existing slow motion exits cleanly.
    const wantsActive = held && canActivate;
    if (wantsActive && !this.heldLastFrame && !this.targetActive && this._charge >= DARK_MATTER_MIN_ACTIVATION) {
      this.targetActive = true;
      this.callbacks.onEnter();
    } else if (wantsActive && !this.targetActive && this._charge < DARK_MATTER_MIN_ACTIVATION && !this.heldLastFrame) {
      this.insufficientTimer = DARK_MATTER_INSUFFICIENT_FLASH_MS;
    }
    if ((!wantsActive || this._charge <= 0) && this.targetActive) {
      this.targetActive = false;
      this.callbacks.onExit();
    }
    this.heldLastFrame = held;

    if (this.targetActive) {
      this._charge = Math.max(0, this._charge - DARK_MATTER_DRAIN_PER_SECOND * dtSec);
      if (this._charge <= 0) {
        this.targetActive = false;
        this.callbacks.onExit();
      }
    }

    this.updateHarvest(realDtMs, holes, playerX, playerY);

    const target = this.targetActive ? DARK_MATTER_TIME_SCALE : 1;
    const ramp = this.targetActive ? DARK_MATTER_ENTRY_RAMP_MS : DARK_MATTER_EXIT_RAMP_MS;
    const maxStep = (1 - DARK_MATTER_TIME_SCALE) * realDtMs / ramp;
    const delta = target - this._timeScale;
    this._timeScale += Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
    this.callbacks.onScale(this._timeScale);
    return this._timeScale;
  }

  private updateHarvest(realDtMs: number, holes: readonly BlackHole[], px: number, py: number): void {
    this._harvesting = false;
    this._harvestRate = 0;
    this._coreHarvesting = false;
    // Do not recharge until the exit ramp has completely restored reality.
    if (this.active || this._charge >= DARK_MATTER_CAPACITY) return;

    let strongest = 0;
    let eligibleInRange = 0;
    for (const hole of holes) {
      if (!hole.active || hole.isSpawning || hole.overloaded) continue;
      const radius = BlackHole.ATTRACT_RADIUS;
      const distance = Math.hypot(hole.position.x - px, hole.position.y - py);
      if (distance >= radius) continue;
      eligibleInRange++;
      const proximity = Math.max(0, Math.min(1, 1 - distance / radius));
      const rate = DARK_MATTER_HARVEST_MIN_PER_SECOND
        + (DARK_MATTER_HARVEST_MAX_PER_SECOND - DARK_MATTER_HARVEST_MIN_PER_SECOND)
        * Math.pow(proximity, DARK_MATTER_HARVEST_EXPONENT);
      strongest = Math.max(strongest, rate);
      if (distance <= radius * BH_CORE_RADIUS_FRACTION) this._coreHarvesting = true;
    }
    if (strongest <= 0) return;
    const bonus = Math.min(DARK_MATTER_MULTI_HOLE_BONUS_MAX, 1 + Math.max(0, eligibleInRange - 1) * 0.25);
    this._harvestRate = strongest * bonus;
    this._charge = Math.min(DARK_MATTER_CAPACITY, this._charge + this._harvestRate * realDtMs / 1000);
    this._harvesting = true;
  }

  /** Deterministic browser-test hook; gameplay never calls this. */
  debugSetCharge(value: number): void {
    this._charge = Math.max(0, Math.min(DARK_MATTER_CAPACITY, value));
  }
}

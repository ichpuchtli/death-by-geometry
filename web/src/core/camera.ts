import { Vec2 } from './vector';
import { CAMERA_LERP_SPEED } from '../config';
import { gameSettings } from '../settings';

export class Camera {
  position = new Vec2(0, 0);
  shakeX = 0;
  shakeY = 0;
  fixedView = false;
  clampToArena = true;
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeElapsed = 0;

  constructor(public viewportWidth: number, public viewportHeight: number) {}

  shake(intensity: number, duration: number = 0.2): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeElapsed = 0;
  }

  updateShake(dt: number): void {
    if (this.shakeIntensity <= 0) {
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    this.shakeElapsed += dt / 1000;
    if (this.shakeElapsed >= this.shakeDuration) {
      this.shakeIntensity = 0;
      this.shakeX = 0;
      this.shakeY = 0;
      return;
    }
    const decay = 1 - this.shakeElapsed / this.shakeDuration;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeIntensity * decay;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeIntensity * decay;
  }

  get renderX(): number { return this.position.x + this.shakeX; }
  get renderY(): number { return this.position.y + this.shakeY; }

  /** Normalized shake intensity (0-1) for post-process effects */
  get shakeNormalized(): number {
    if (this.shakeIntensity <= 0) return 0;
    const decay = Math.max(0, 1 - this.shakeElapsed / this.shakeDuration);
    return Math.min(1, (this.shakeIntensity * decay) / 20);
  }

  follow(target: Vec2, lerpFactor: number = CAMERA_LERP_SPEED): void {
    if (this.fixedView) {
      this.position.x = 0;
      this.position.y = 0;
      return;
    }
    this.position.x += (target.x - this.position.x) * lerpFactor;
    this.position.y += (target.y - this.position.y) * lerpFactor;
    this.clamp();
  }

  snapTo(target: Vec2): void {
    if (this.fixedView) {
      this.position.x = 0;
      this.position.y = 0;
      return;
    }
    this.position.copyFrom(target);
    this.clamp();
  }

  private clamp(): void {
    if (!this.clampToArena) return;
    const halfW = this.viewportWidth / 2;
    const halfH = this.viewportHeight / 2;
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;

    if (this.position.x - halfW < -hw) this.position.x = -hw + halfW;
    if (this.position.x + halfW > hw) this.position.x = hw - halfW;
    if (this.position.y - halfH < -hh) this.position.y = -hh + halfH;
    if (this.position.y + halfH > hh) this.position.y = hh - halfH;
  }

  resize(w: number, h: number): void {
    this.viewportWidth = w;
    this.viewportHeight = h;
  }

  /** Check if a world position is visible on screen (with padding) */
  isVisible(wx: number, wy: number, padding: number = 100): boolean {
    const halfW = this.viewportWidth / 2 + padding;
    const halfH = this.viewportHeight / 2 + padding;
    return (
      Math.abs(wx - this.position.x) < halfW &&
      Math.abs(wy - this.position.y) < halfH
    );
  }
}

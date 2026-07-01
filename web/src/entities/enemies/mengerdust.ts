import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, MENGERDUST_HP, MENGERDUST_ABSORB_COUNT, MENGERDUST_OVERLOAD_DURATION } from '../../config';

/** MengerDust — Menger sponge cross-section. Absorbs bullets, then becomes vulnerable. */
export class MengerDust extends Enemy {
  absorbedBullets = 0;
  overloaded = false;
  private overloadTimer = 0;
  private hitFlash = 0;
  private cellGlow: number[] = [0, 0, 0, 0, 0, 0, 0, 0]; // 8 outer cells glow state

  constructor() {
    super();
    this.color = COLORS.mengerdust.color;
    this.color2 = COLORS.mengerdust.color2;
    this.speed = ENEMY_SPEED.mengerdust;
    this.scoreValue = ENEMY_SCORES.mengerdust;
    this.hp = MENGERDUST_HP;
    this.maxHp = MENGERDUST_HP;
    this.collisionRadius = 50;

    // Outer square shape
    const s = 35;
    this.shapePoints = [[s, s], [-s, s], [-s, -s], [s, -s]];
  }

  onBulletHit(_bulletAngle: number): 'damage' | 'absorb' | 'reflect' {
    if (this.overloaded) return 'damage';
    if (this.absorbedBullets < MENGERDUST_ABSORB_COUNT) {
      this.absorbedBullets++;
      // Light up a cell
      if (this.absorbedBullets <= this.cellGlow.length) {
        this.cellGlow[this.absorbedBullets - 1] = 1.0;
      }
      // Check for overload
      if (this.absorbedBullets >= MENGERDUST_ABSORB_COUNT) {
        this.overloaded = true;
        this.overloadTimer = MENGERDUST_OVERLOAD_DURATION;
      }
      return 'absorb';
    }
    return 'damage';
  }

  hit(): boolean {
    this.hitFlash = 0.15;
    return super.hit();
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;
    if (this.hitFlash > 0) this.hitFlash -= dt / 1000;

    // Tick overload
    if (this.overloaded) {
      this.overloadTimer -= dt / 1000;
      if (this.overloadTimer <= 0) {
        // Reset — survived the window
        this.overloaded = false;
        this.overloadTimer = 0;
        this.absorbedBullets = 0;
        for (let i = 0; i < this.cellGlow.length; i++) this.cellGlow[i] = 0;
      }
    }

    // Fade cell glow
    for (let i = 0; i < this.cellGlow.length; i++) {
      if (this.cellGlow[i] > 0 && !this.overloaded) {
        this.cellGlow[i] = Math.max(0.3, this.cellGlow[i] - dt * 0.0005);
      }
    }

    this.follow(playerPos);
    this.move(dt);
    this.bounce();
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnCrystallize(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    const px = this.position.x;
    const py = this.position.y;
    const s = 35;
    const cellSize = s * 2 / 3;
    const drawColor: [number, number, number] = this.hitFlash > 0 ? [1, 1, 1]
      : this.overloaded ? [1, 1, 1] : this.color;

    // Outer square
    const points = this.getWorldPoints();
    renderer.drawLineLoop(points.map(([x, y]) => [x - 1, y]), this.color2);
    renderer.drawLineLoop(points, drawColor);

    // Draw 8 sub-cells (3x3 grid minus center)
    const positions = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1],
    ];

    for (let i = 0; i < positions.length; i++) {
      const [gx, gy] = positions[i];
      const cx = px + gx * cellSize;
      const cy = py + gy * cellSize;
      const halfCell = cellSize / 2 - 2;

      const glow = this.cellGlow[i];
      if (glow > 0) {
        // Glowing absorbed cell
        renderer.drawFilledCircle(cx, cy, halfCell * 0.6,
          [1, 1, 1], 8, glow * 0.6);
      }

      // Cell outline
      const alpha = this.overloaded ? 0.9 : 0.5;
      const col = this.overloaded ? [1, 1, 1] as [number, number, number] : this.color2;
      renderer.drawCircle(cx, cy, halfCell, col, 4, alpha);
    }

    // Center hole (dark)
    renderer.drawFilledCircle(px, py, cellSize / 2 - 2, [0.02, 0.01, 0.0], 8, 0.8);
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.3 + Math.sin(time * 1.5) * 0.15;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 8,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 24);
  }
}

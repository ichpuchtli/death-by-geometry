import { Entity } from '../entity';
import { Vec2 } from '../../core/vector';
import { Renderer } from '../../renderer/sprite-batch';
import { ENEMY_COLLISION_RADIUS, SPAWN_DURATION_DEFAULT } from '../../config';
import { gameSettings } from '../../settings';
import { EnemyType } from '../../spawner/spawn-patterns';

export type EnemyDeathResult = {
  spawnEnemies?: { type: EnemyType; position: Vec2; tier?: number }[];
  /** If true, children spawn with a staggered theatrical delay */
  staggeredSpawn?: boolean;
};

export abstract class Enemy extends Entity {
  speed = 0.1;
  scoreValue = 0;
  hp = 1;
  maxHp = 1;
  color: [number, number, number] = [1, 1, 1];
  color2: [number, number, number] = [0.5, 0.5, 0.5];
  /** Base shape vertices (unrotated, unscaled) */
  shapePoints: number[][] = [];
  rotationSpeed = 0;
  trailId = -1; // assigned by TrailSystem
  spawnDuration = SPAWN_DURATION_DEFAULT;
  spawnTimer = SPAWN_DURATION_DEFAULT; // seconds remaining in spawn warp-in animation
  get isSpawning(): boolean { return this.spawnTimer > 0; }
  displacer = new Vec2(
    (Math.random() - 0.5) * 64,
    (Math.random() - 0.5) * 64,
  );

  // Elite metadata
  baseType = '';
  isElite = false;
  isMiniboss = false;
  /** Whether this enemy is immune to BlackHole gravitational pull and absorption */
  gravityImmune = false;

  constructor() {
    super();
    this.collisionRadius = ENEMY_COLLISION_RADIUS;
  }

  /** Place at a random position along the world edges */
  spawnAtEdge(): void {
    const aw = gameSettings.arenaWidth;
    const ah = gameSettings.arenaHeight;
    const hw = aw / 2;
    const hh = ah / 2;
    const side = Math.floor(Math.random() * 4);
    switch (side) {
      case 0: // top
        this.position.set((Math.random() - 0.5) * aw, hh - 10);
        break;
      case 1: // bottom
        this.position.set((Math.random() - 0.5) * aw, -hh + 10);
        break;
      case 2: // left
        this.position.set(-hw + 10, (Math.random() - 0.5) * ah);
        break;
      case 3: // right
        this.position.set(hw - 10, (Math.random() - 0.5) * ah);
        break;
    }
  }

  /** Place at a random position anywhere within the arena */
  spawnAnywhere(): void {
    const margin = 50;
    const hw = gameSettings.arenaWidth / 2 - margin;
    const hh = gameSettings.arenaHeight / 2 - margin;
    this.position.set(
      (Math.random() - 0.5) * 2 * hw,
      (Math.random() - 0.5) * 2 * hh,
    );
  }

  /** Move toward a target position */
  protected follow(target: Vec2): void {
    const dir = target.add(this.displacer).sub(this.position);
    const m = dir.magnitude();
    if (m > 0) {
      this.velocity.set(dir.x / m * this.speed, dir.y / m * this.speed);
    }
  }

  /** Move toward where the target will be (predictive) */
  protected attack(target: Vec2, targetVel: Vec2): void {
    const predicted = target.add(targetVel.scale(100)).add(this.displacer);
    const dir = predicted.sub(this.position);
    const m = dir.magnitude();
    if (m > 0) {
      this.velocity.set(dir.x / m * this.speed, dir.y / m * this.speed);
    }
  }

  /** Bounce off world edges */
  protected bounce(): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    if (Math.abs(this.position.x) >= hw) {
      this.velocity.x *= -1;
      this.position.x *= 0.99;
    }
    if (Math.abs(this.position.y) >= hh) {
      this.velocity.y *= -1;
      this.position.y *= 0.99;
    }
  }

  /** Get the rotated shape points at world position */
  getWorldPoints(): number[][] {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return this.shapePoints.map(([x, y]) => [
      this.position.x + x * cos - y * sin,
      this.position.y + x * sin + y * cos,
    ]);
  }

  /** Render spawn warp-in effect — cranked to 11 */
  renderSpawn(renderer: Renderer): void {
    const progress = 1 - this.spawnTimer / this.spawnDuration;
    const cx = this.position.x;
    const cy = this.position.y;

    // Outer shockwave ring — expands and fades
    const shockR = 80 * progress;
    const shockAlpha = 0.7 * (1 - progress);
    renderer.drawCircle(cx, cy, shockR, [1, 1, 1], 32, shockAlpha);

    // Multiple converging rings — shrink inward with staggered timing
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.12;
      const rp = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
      const ringR = 70 * (1 - rp) + 5;
      const ringAlpha = 0.5 * (1 - rp) * rp;
      const hue = i * 0.3;
      renderer.drawCircle(cx, cy, ringR, [
        this.color[0] * (1 - hue) + hue,
        this.color[1] * (1 - hue) + hue * 0.5,
        this.color[2] * (1 - hue) + hue * 0.8,
      ], 24, ringAlpha);
    }

    // Bright center flash at peak
    if (progress > 0.7) {
      const flashProgress = (progress - 0.7) / 0.3;
      const flashR = 8 + flashProgress * 15;
      const flashAlpha = flashProgress * 0.9;
      renderer.drawFilledCircle(cx, cy, flashR, [1, 1, 1], 16, flashAlpha);
    }

    // Radial spokes — rotating energy lines converging to center
    const spokeCount = 6;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2 + progress * Math.PI;
      const outerR = 45 * (1 - progress);
      const innerR = 5;
      const sx1 = cx + Math.cos(angle) * outerR;
      const sy1 = cy + Math.sin(angle) * outerR;
      const sx2 = cx + Math.cos(angle) * innerR;
      const sy2 = cy + Math.sin(angle) * innerR;
      renderer.drawLine(sx1, sy1, sx2, sy2,
        this.color[0], this.color[1], this.color[2], 0.4 * progress);
    }

    // Render shape fading in with scale pulse
    const scale = 1 + (1 - progress) * 0.5;
    const points = this.getWorldPoints();
    const scaledPoints = points.map(([x, y]) => [
      cx + (x - cx) * scale,
      cy + (y - cy) * scale,
    ]);
    renderer.drawLineLoop(scaledPoints.map(([x, y]) => [x - 1, y]), this.color2, progress * 0.5);
    renderer.drawLineLoop(scaledPoints, this.color, progress);
  }

  /** Style B: Fractal Crystallization — shape fragments coalesce inward */
  protected renderSpawnCrystallize(renderer: Renderer): void {
    const progress = 1 - this.spawnTimer / this.spawnDuration;
    const cx = this.position.x;
    const cy = this.position.y;

    // Shape fragments scattered outward, lerping to final position
    const points = this.getWorldPoints();
    const scatter = (1 - progress) * 80;
    const fragAlpha = progress * 0.8;

    for (let i = 0; i < points.length; i++) {
      const seed = (i * 7919 + 1) % 97 / 97; // deterministic pseudo-random per vertex
      const angle = seed * Math.PI * 2;
      const ox = Math.cos(angle) * scatter;
      const oy = Math.sin(angle) * scatter;
      const fx = points[i][0] + ox * (1 - progress);
      const fy = points[i][1] + oy * (1 - progress);
      const nx = points[(i + 1) % points.length][0] + Math.cos((seed + 0.3) * Math.PI * 2) * scatter * (1 - progress);
      const ny = points[(i + 1) % points.length][1] + Math.sin((seed + 0.3) * Math.PI * 2) * scatter * (1 - progress);
      renderer.drawLine(fx, fy, nx, ny,
        this.color[0], this.color[1], this.color[2], fragAlpha);
    }

    // Crystalline sparkle lines between fragments
    if (progress > 0.3) {
      const sparkAlpha = (progress - 0.3) * 0.6;
      for (let i = 0; i < points.length; i += 2) {
        const j = (i + Math.floor(points.length / 2)) % points.length;
        renderer.drawLine(points[i][0], points[i][1], points[j][0], points[j][1],
          1, 1, 1, sparkAlpha * (1 - progress));
      }
    }

    // Converging ring
    const ringR = 60 * (1 - progress) + 5;
    renderer.drawCircle(cx, cy, ringR, this.color, 20, 0.4 * (1 - progress));
  }

  /** Style C: Dimensional Rift — vertical slit tears open into ellipse */
  protected renderSpawnRift(renderer: Renderer): void {
    const progress = 1 - this.spawnTimer / this.spawnDuration;
    const cx = this.position.x;
    const cy = this.position.y;

    // Vertical slit that widens into ellipse
    const slitHeight = 50;
    const width = progress * 40;
    const segs = 16;

    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2;
      const a2 = ((i + 1) / segs) * Math.PI * 2;
      const x1 = cx + Math.cos(a1) * width;
      const y1 = cy + Math.sin(a1) * slitHeight * (0.2 + progress * 0.8);
      const x2 = cx + Math.cos(a2) * width;
      const y2 = cy + Math.sin(a2) * slitHeight * (0.2 + progress * 0.8);
      const alpha = 0.6 * progress;
      renderer.drawLine(x1, y1, x2, y2,
        this.color[0], this.color[1], this.color[2], alpha);
    }

    // Horizontal distortion lines
    const lineCount = 5;
    for (let i = 0; i < lineCount; i++) {
      const t = (i / (lineCount - 1)) - 0.5;
      const ly = cy + t * slitHeight * progress;
      const lw = width * (1 - Math.abs(t) * 0.5);
      const alpha = 0.3 * progress * (1 - Math.abs(t));
      renderer.drawLine(cx - lw, ly, cx + lw, ly,
        1, 1, 1, alpha);
    }

    // Entity fading in at center
    if (progress > 0.5) {
      const fadeIn = (progress - 0.5) * 2;
      const scale = 1 + (1 - fadeIn) * 0.3;
      const points = this.getWorldPoints();
      const scaledPoints = points.map(([x, y]) => [
        cx + (x - cx) * scale,
        cy + (y - cy) * scale,
      ]);
      renderer.drawLineLoop(scaledPoints, this.color, fadeIn * 0.8);
    }
  }

  /** Style D: Gravity Well — concentric rings contracting inward, dark center expands */
  protected renderSpawnGravity(renderer: Renderer): void {
    const progress = 1 - this.spawnTimer / this.spawnDuration;
    const cx = this.position.x;
    const cy = this.position.y;

    // Concentric rings contracting inward
    const ringCount = 5;
    for (let i = 0; i < ringCount; i++) {
      const phase = (i / ringCount + progress * 0.5) % 1;
      const ringR = 80 * (1 - phase);
      const alpha = 0.4 * phase * (1 - phase);
      renderer.drawCircle(cx, cy, ringR,
        [this.color[0] * 0.7, this.color[1] * 0.7, this.color[2] * 0.7], 24, alpha);
    }

    // Dark center that expands
    const darkR = progress * 25;
    renderer.drawFilledCircle(cx, cy, darkR, [0.02, 0.0, 0.04], 16, 0.7 * progress);

    // Core glow pulse
    if (progress > 0.4) {
      const coreProgress = (progress - 0.4) / 0.6;
      renderer.drawCircle(cx, cy, darkR + 5, this.color, 16, coreProgress * 0.6);
    }

    // Entity emerges at end
    if (progress > 0.6) {
      const fadeIn = (progress - 0.6) / 0.4;
      const points = this.getWorldPoints();
      const scale = 0.5 + fadeIn * 0.5;
      const scaledPoints = points.map(([x, y]) => [
        cx + (x - cx) * scale,
        cy + (y - cy) * scale,
      ]);
      renderer.drawLineLoop(scaledPoints, this.color, fadeIn);
    }
  }

  /** Default rendering: draw the shape as a colored line loop */
  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }
    const points = this.getWorldPoints();
    // Outer line (color2)
    renderer.drawLineLoop(points.map(([x, y]) => [x - 1, y]), this.color2);
    // Main line (color)
    renderer.drawLineLoop(points, this.color);
    // Elite crown ring
    if (this.isElite) {
      this.renderEliteRing(renderer);
    }
  }

  /** Golden crown ring + thicker glow for elite enemies */
  protected renderEliteRing(renderer: Renderer): void {
    const cx = this.position.x;
    const cy = this.position.y;
    const r = this.collisionRadius + 6;
    // Rotating dashed crown ring (golden)
    const segments = 12;
    const rot = Date.now() * 0.002;
    for (let i = 0; i < segments; i++) {
      if (i % 2 === 0) continue; // skip every other = dashed
      const a1 = rot + (i / segments) * Math.PI * 2;
      const a2 = rot + ((i + 1) / segments) * Math.PI * 2;
      renderer.drawLine(
        cx + Math.cos(a1) * r, cy + Math.sin(a1) * r,
        cx + Math.cos(a2) * r, cy + Math.sin(a2) * r,
        1, 0.85, 0.2, 0.5,
      );
    }
    // Outer glow ring (dim)
    renderer.drawCircle(cx, cy, r + 3, [1, 0.9, 0.3], 20, 0.15);
  }

  /** Render with unique glow effect for game over screen. Override per enemy type. */
  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    // Default: render normally + pulsing glow ring
    this.render(renderer);
    const pulse = 0.5 + Math.sin(time * 3) * 0.3;
    const glowR = this.collisionRadius + 8;
    renderer.drawCircle(this.position.x, this.position.y, glowR,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 24);
  }

  /** Called when a bullet collides. Override for special bullet interactions.
   *  'damage' = normal hit, 'absorb' = consume bullet no damage, 'reflect' = bounce bullet back */
  onBulletHit(_bulletAngle: number): 'damage' | 'absorb' | 'reflect' {
    return 'damage';
  }

  /** Returns true if the enemy is now dead */
  hit(): boolean {
    this.hp--;
    if (this.hp <= 0) {
      this.active = false;
      return true;
    }
    return false;
  }

  /** Override to spawn children on death */
  onDeath(): EnemyDeathResult {
    return {};
  }
}

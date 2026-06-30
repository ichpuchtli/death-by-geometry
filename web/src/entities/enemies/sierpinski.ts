import { Enemy, EnemyDeathResult } from './enemy';
import { Vec2 } from '../../core/vector';
import { Renderer } from '../../renderer/sprite-batch';
import { EnemyType } from '../../spawner/spawn-patterns';
import { COLORS, SIERPINSKI_TIER_HP, SIERPINSKI_TIER_RADIUS, SIERPINSKI_TIER_SPEED, SIERPINSKI_TIER_SCORE, SIERPINSKI_TIER_DEPTH } from '../../config';

/**
 * Sierpinski fractal triangle — 3-tier boss with fractal breakup.
 * Tier 0 (boss): depth 3, 80px, 12 HP → splits into 3 × tier 1
 * Tier 1 (medium): depth 2, 45px, 4 HP → splits into 3 × tier 2
 * Tier 2 (small): depth 1, 25px, 1 HP → dies (no children)
 */
export class Sierpinski extends Enemy {
  readonly tier: number;
  private depth: number;
  private hitFlash = 0;

  constructor(tier = 0, pos?: Vec2) {
    super();
    this.tier = tier;
    this.depth = SIERPINSKI_TIER_DEPTH[tier];
    this.color = COLORS.sierpinski.color;
    this.color2 = COLORS.sierpinski.color2;
    this.speed = SIERPINSKI_TIER_SPEED[tier];
    this.scoreValue = SIERPINSKI_TIER_SCORE[tier];
    this.hp = SIERPINSKI_TIER_HP[tier];
    this.maxHp = SIERPINSKI_TIER_HP[tier];
    this.collisionRadius = SIERPINSKI_TIER_RADIUS[tier];

    // Tier 0 is a miniboss (resists separation push, immune to gravity)
    if (tier === 0) {
      this.isMiniboss = true;
      this.gravityImmune = true;
    }

    // Precompute outer triangle as shape points for collision
    const size = this.collisionRadius;
    const h = size * Math.sqrt(3) / 2;
    this.shapePoints = [[0, h * 0.67], [-size / 2, -h * 0.33], [size / 2, -h * 0.33]];

    if (pos) {
      this.position.copyFrom(pos);
    }
  }

  hit(): boolean {
    this.hitFlash = 0.15;
    return super.hit();
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;
    if (this.hitFlash > 0) this.hitFlash -= dt / 1000;
    this.follow(playerPos);
    this.rotation += dt * 0.001;
    this.move(dt);
    this.bounce();
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnCrystallize(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const px = this.position.x;
    const py = this.position.y;
    const drawColor: [number, number, number] = this.hitFlash > 0 ? [1, 1, 1] : this.color;

    // Draw all triangles of the Sierpinski at current depth
    const triangles = generateSierpinskiTriangles(this.depth, this.collisionRadius);
    const time = Date.now() * 0.001;

    for (let t = 0; t < triangles.length; t++) {
      const tri = triangles[t];
      // Bioluminescence pulse: ripple outward from center
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
      const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const pulse = 0.7 + Math.sin(time * 3 - dist * 0.1) * 0.3;

      const points: number[][] = [];
      for (const [x, y] of tri) {
        points.push([
          px + x * cos - y * sin,
          py + x * sin + y * cos,
        ]);
      }

      const col: [number, number, number] = [
        drawColor[0] * pulse,
        drawColor[1] * pulse,
        drawColor[2] * pulse,
      ];
      renderer.drawLineLoop(points, col);
    }
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.3 + Math.sin(time * 2) * 0.15;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 8,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 20);
  }

  onDeath(): EnemyDeathResult {
    // Tier 2 (smallest) — no children
    if (this.tier >= 2) return {};

    // Spawn 3 children at the sub-triangle centers, rotated by parent's rotation
    const size = this.collisionRadius;
    const h = size * Math.sqrt(3) / 2;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);

    // Sub-triangle center offsets (relative to parent center, pre-rotation)
    const offsets: [number, number][] = [
      [0, h / 3],              // top sub-triangle
      [-size / 4, -h / 6],     // bottom-left sub-triangle
      [size / 4, -h / 6],      // bottom-right sub-triangle
    ];

    const childTier = this.tier + 1;
    const spawns: { type: EnemyType; position: Vec2; tier: number }[] = [];

    for (const [ox, oy] of offsets) {
      // Rotate offset by parent rotation
      const rx = ox * cos - oy * sin;
      const ry = ox * sin + oy * cos;
      spawns.push({
        type: 'sierpinski',
        position: new Vec2(this.position.x + rx, this.position.y + ry),
        tier: childTier,
      });
    }

    return { spawnEnemies: spawns };
  }
}

/** Generate filled triangles for rendering at given depth */
function generateSierpinskiTriangles(depth: number, size: number): [number, number][][] {
  const h = size * Math.sqrt(3) / 2;
  const top: [number, number] = [0, h * 0.67];
  const bl: [number, number] = [-size / 2, -h * 0.33];
  const br: [number, number] = [size / 2, -h * 0.33];

  if (depth <= 0) return [[top, bl, br]];

  return subdivide(top, bl, br, depth);
}

function subdivide(
  a: [number, number], b: [number, number], c: [number, number], depth: number,
): [number, number][][] {
  if (depth <= 0) return [[a, b, c]];

  const ab: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const bc: [number, number] = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
  const ca: [number, number] = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];

  // 3 sub-triangles (center removed)
  return [
    ...subdivide(a, ab, ca, depth - 1),
    ...subdivide(ab, b, bc, depth - 1),
    ...subdivide(ca, bc, c, depth - 1),
  ];
}

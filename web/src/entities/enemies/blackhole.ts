import { Enemy, EnemyDeathResult } from './enemy';
import { Vec2 } from '../../core/vector';
import { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, BLACKHOLE_HP, BLACKHOLE_PALETTE } from '../../config';
import { gameSettings } from '../../settings';

export type BlackHoleVisualMode = 'dense' | 'haze' | 'corona' | 'molten';

// --- Shared state interfaces ---

interface SwirlParticle {
  arm: number;       // which spiral arm
  t: number;         // 0-1 position along spiral (1=outer, 0=center)
  speed: number;     // infall rate per ms
  brightness: number;
  size: number;      // streak length multiplier
}

interface HorizonParticle {
  angle: number;
  speed: number;
  orbitR: number;    // multiplier of ring radius
  brightness: number;
  trailLen: number;  // trail angle span behind particle
}

interface InfallStreak {
  angle: number;
  r: number;         // current distance from center (shrinking)
  speed: number;
  length: number;
  alpha: number;
  curveDir: number;  // -1 or 1: which way the streak curves as it falls in
}

const TWO_PI = Math.PI * 2;
const P = BLACKHOLE_PALETTE;

/** Gravity/Black Hole enemy — 4 accretion disc visual weight variants */
export class BlackHole extends Enemy {
  absorbedCount = 0;
  overloaded = false;
  destabilizing = false;
  destabilizeTimer = 0;

  override hp = BLACKHOLE_HP;
  override maxHp = BLACKHOLE_HP;
  override family = 'blackhole' as const;
  override separationWeight = 0; // immovable

  visualMode: BlackHoleVisualMode = 'dense';

  private wobbleTime = 0;
  private hitFlash = 0;

  // Shared swirl state
  private swirlParticles: SwirlParticle[] = [];
  private swirlRotation = 0;

  // Shared horizon state
  private horizonParticles: HorizonParticle[] = [];
  private infallStreaks: InfallStreak[] = [];
  private infallSpawnTimer = 0;
  private coronaFlicker = 0;

  // Breathing pulse
  private breathPhase = 0;

  needsGridPulse = false;
  gridPulseStrength = 0;

  static readonly MAX_ABSORB = 12;
  static get ATTRACT_RADIUS(): number { return gameSettings.bhAttractRadius; }
  static get GRAVITY_STRENGTH(): number { return gameSettings.bhEnemyPull; }

  /** Current breath-cycle mass multiplier for grid fabric modulation.
   *  Noticeable even at base mass, dramatic at full mass. */
  get breathMassMultiplier(): number {
    const instability = this.absorbedCount / BlackHole.MAX_ABSORB;
    return 1.0 + Math.sin(this.breathPhase) * (0.2 + instability * 0.25);
  }

  constructor() {
    super();
    this.color = COLORS.blackhole.color;
    this.color2 = COLORS.blackhole.color2;
    this.speed = ENEMY_SPEED.blackhole;
    this.scoreValue = ENEMY_SCORES.blackhole;
    this.collisionRadius = 30;
    this.shapePoints = [];

    // Initialize shared state
    for (let i = 0; i < 28; i++) this.pushSwirlParticle(i % 4);
    for (let i = 0; i < 12; i++) this.pushHorizonParticle();
  }

  private pushSwirlParticle(arm: number): void {
    this.swirlParticles.push({
      arm,
      t: Math.random(),
      speed: 0.00015 + Math.random() * 0.00035,
      brightness: 0.4 + Math.random() * 0.6,
      size: 0.7 + Math.random() * 0.6,
    });
  }

  private pushHorizonParticle(): void {
    const dir = Math.random() < 0.5 ? 1 : -1;
    this.horizonParticles.push({
      angle: Math.random() * TWO_PI,
      speed: (0.0012 + Math.random() * 0.0025) * dir,
      orbitR: 0.93 + Math.random() * 0.14,
      brightness: 0.4 + Math.random() * 0.6,
      trailLen: 0.08 + Math.random() * 0.15,
    });
  }

  private spawnInfallStreak(): void {
    const baseR = this.collisionRadius;
    this.infallStreaks.push({
      angle: Math.random() * TWO_PI,
      r: baseR * (1.4 + Math.random() * 1.2),
      speed: 0.025 + Math.random() * 0.04,
      length: 6 + Math.random() * 14,
      alpha: 0.25 + Math.random() * 0.5,
      curveDir: Math.random() < 0.5 ? 1 : -1,
    });
  }

  absorbEnemy(): void {
    this.absorbedCount++;
    this.collisionRadius = 30 + this.absorbedCount * 2.5;
    for (let i = 0; i < 4; i++) this.pushSwirlParticle(i % 4);
    for (let i = 0; i < 2; i++) this.pushHorizonParticle();
    if (this.absorbedCount >= BlackHole.MAX_ABSORB && !this.destabilizing) {
      this.destabilizing = true;
      this.destabilizeTimer = 0;
    }
  }

  override onBulletHit(_bulletAngle: number): 'damage' | 'absorb' | 'reflect' {
    this.hitFlash = 1;
    if (this.absorbedCount > 0) {
      this.absorbedCount--;
      this.collisionRadius = 30 + this.absorbedCount * 2.5;
      if (this.swirlParticles.length > 28) {
        for (let i = 0; i < 4; i++) this.swirlParticles.pop();
      }
      if (this.horizonParticles.length > 12) {
        this.horizonParticles.pop(); this.horizonParticles.pop();
      }
      return 'absorb';
    }
    return 'damage';
  }

  update(dt: number, _playerPos?: Vec2): void {
    if (!this.active) return;
    const instability = this.absorbedCount / BlackHole.MAX_ABSORB;

    // Destabilize countdown → overload
    if (this.destabilizing && !this.overloaded) {
      this.destabilizeTimer += dt;
      if (this.destabilizeTimer >= 1500) {
        this.overloaded = true;
      }
    }

    this.rotation += dt * (0.003 + this.absorbedCount * 0.0008);
    this.wobbleTime += dt;
    this.breathPhase += dt * (0.002 + instability * 0.003);

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 0.004);
    }

    // Swirl rotation — accelerates with mass
    this.swirlRotation += dt * (0.0008 + this.absorbedCount * 0.0005);
    for (const sp of this.swirlParticles) {
      sp.t -= dt * sp.speed * (1 + (1 - sp.t) * 2.5);
      if (sp.t <= 0) {
        sp.t = 1;
        sp.brightness = 0.4 + Math.random() * 0.6;
      }
    }

    // Horizon particles orbit
    for (const hp of this.horizonParticles) {
      hp.angle += dt * hp.speed * (1 + instability * 0.5);
    }

    // Corona flicker
    this.coronaFlicker += dt * 0.003;

    // Infall streak lifecycle
    this.infallSpawnTimer -= dt;
    if (this.infallSpawnTimer <= 0) {
      this.spawnInfallStreak();
      this.infallSpawnTimer = 60 + Math.random() * (180 - instability * 120);
    }
    const ringR = this.collisionRadius * 0.75;
    for (const s of this.infallStreaks) {
      s.r -= dt * s.speed * (1 + Math.max(0, 1 - s.r / (this.collisionRadius * 1.5)) * 3);
      s.angle += dt * 0.0005 * s.curveDir * (1 + instability);
    }
    this.infallStreaks = this.infallStreaks.filter(s => s.r > ringR * 0.85);
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnGravity(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }
    switch (this.visualMode) {
      case 'dense': this.renderDense(renderer); break;
      case 'haze': this.renderHaze(renderer); break;
      case 'corona': this.renderCorona(renderer); break;
      case 'molten': this.renderMolten(renderer); break;
    }
    // Destabilize telegraph overlay
    if (this.destabilizing && !this.overloaded) {
      this.renderDestabilize(renderer);
    }
  }

  // ============================================================
  // Variant 1 — "Dense Core"
  // Multiple layered filled halos + thick filled ring band.
  // Maximum geometry for heaviest bloom contribution.
  // ============================================================
  private renderDense(renderer: Renderer): void {
    const instability = this.absorbedCount / BlackHole.MAX_ABSORB;
    const baseR = this.collisionRadius;
    const px = this.position.x;
    const py = this.position.y;
    const breath = Math.sin(this.breathPhase) * 0.06 * (1 + instability);
    const ringR = baseR * (0.75 + breath);

    // Layered glow halos (outermost → innermost)
    const [sr, sg, sb] = P.swirlArm;
    renderer.drawFilledCircle(px, py, baseR * (1.6 + breath * 0.5), [sr * 0.3, sg * 0.3, sb * 0.3], 28, 0.025 + instability * 0.02);
    renderer.drawFilledCircle(px, py, baseR * (1.3 + breath * 0.3), [sr * 0.5, sg * 0.5, sb * 0.5], 28, 0.05 + instability * 0.03);
    renderer.drawFilledCircle(px, py, baseR * (1.05 + breath * 0.2), P.swirlArm, 28, 0.08 + instability * 0.04);

    // Dark void
    renderer.drawFilledCircle(px, py, ringR * 0.88, P.voidBlack, 28, 1.0);

    // Thick ring band (filled wedge quads)
    const bandWidth = 5 + instability * 4;
    this.renderThickRing(renderer, px, py, ringR - bandWidth * 0.3, ringR + bandWidth * 0.7, P.horizonRing, 48, 0.35 + instability * 0.15);

    // Bright inner ring edge
    renderer.drawCircle(px, py, ringR - bandWidth * 0.3, [1, 1, 1], 48, 0.3 + instability * 0.1);

    // Orbit particles as larger filled dots
    const [odr, odg, odb] = P.orbitDot;
    for (const hp of this.horizonParticles) {
      const r = ringR * hp.orbitR;
      const hpx = px + Math.cos(hp.angle) * r;
      const hpy = py + Math.sin(hp.angle) * r;
      renderer.drawFilledCircle(hpx, hpy, 2.5 + instability * 1.5, [odr, odg, odb], 8, hp.brightness * 0.8);
      // Short trail arc
      const ta = hp.angle + hp.trailLen * Math.sign(hp.speed);
      renderer.drawLine(
        hpx, hpy,
        px + Math.cos(ta) * r, py + Math.sin(ta) * r,
        odr, odg, odb, hp.brightness * 0.4,
      );
    }

    // Swirl arms
    this.renderSwirlArms(renderer, px, py, baseR, 4, 3.0, 0.7);

    // Infall streaks
    this.renderInfallStreaks(renderer, px, py, ringR);

    // Danger pulse at high mass
    if (instability > 0.6) {
      const pulse = 0.5 + 0.5 * Math.sin(this.wobbleTime * 0.008);
      renderer.drawCircle(px, py, ringR + 15, [1, 0.35, 0.1], 28, (instability - 0.6) * pulse * 0.35);
    }

    this.needsGridPulse = true;
    this.gridPulseStrength = 12 + instability * 30;
    this.renderHitFlash(renderer, px, py, baseR);
  }

  // ============================================================
  // Variant 2 — "Nebula Haze"
  // Soft cloud of overlapping semi-transparent fills.
  // No hard ring line. Organic, gaseous, thick.
  // ============================================================
  private renderHaze(renderer: Renderer): void {
    const instability = this.absorbedCount / BlackHole.MAX_ABSORB;
    const baseR = this.collisionRadius;
    const px = this.position.x;
    const py = this.position.y;
    const breath = Math.sin(this.breathPhase) * 0.06 * (1 + instability);
    const ringR = baseR * (0.75 + breath);

    // Outer soft halo
    renderer.drawFilledCircle(px, py, baseR * (1.4 + breath), P.swirlTrail, 24, 0.03 + instability * 0.02);

    // Cloud blobs: many medium filled circles scattered at ring radius
    const [ar, ag, ab] = P.swirlArm;
    const [cr, cg, cb] = P.swirlCore;
    const blobCount = 16 + Math.floor(instability * 8);
    for (let i = 0; i < blobCount; i++) {
      const baseAngle = (i / blobCount) * TWO_PI + this.swirlRotation * 0.3;
      // Radial scatter around ring
      const radialNoise = Math.sin(i * 7.3 + this.wobbleTime * 0.002) * baseR * 0.15;
      const blobR = ringR + radialNoise;
      const blobSize = 8 + Math.sin(i * 3.7 + this.wobbleTime * 0.003) * 4 + instability * 5;
      const blobAlpha = 0.03 + Math.sin(i * 5.1 + this.wobbleTime * 0.004) * 0.01 + instability * 0.02;

      const bx = px + Math.cos(baseAngle) * blobR;
      const by = py + Math.sin(baseAngle) * blobR;

      // Alternate warm/hot colors
      if (i % 3 === 0) {
        renderer.drawFilledCircle(bx, by, blobSize, [cr, cg, cb], 12, blobAlpha);
      } else {
        renderer.drawFilledCircle(bx, by, blobSize, [ar, ag, ab], 12, blobAlpha);
      }
    }

    // Dark void on top
    renderer.drawFilledCircle(px, py, ringR * 0.85, P.voidBlack, 28, 1.0);

    // Gentle swirl arms (faint)
    this.renderSwirlArms(renderer, px, py, baseR, 4, 3.0, 0.35);

    // Small ember particles scattered in the cloud
    const [odr, odg, odb] = P.orbitDot;
    for (const hp of this.horizonParticles) {
      const r = ringR * (0.85 + hp.orbitR * 0.3);
      const hpx = px + Math.cos(hp.angle) * r;
      const hpy = py + Math.sin(hp.angle) * r;
      renderer.drawFilledCircle(hpx, hpy, 1.5 + instability, [odr, odg, odb], 6, hp.brightness * 0.5);
    }

    // Infall streaks (faint)
    this.renderInfallStreaks(renderer, px, py, ringR);

    // Danger — diffuse red glow
    if (instability > 0.6) {
      const pulse = 0.5 + 0.5 * Math.sin(this.wobbleTime * 0.008);
      renderer.drawFilledCircle(px, py, ringR * 1.2, [1, 0.3, 0.05], 20, (instability - 0.6) * pulse * 0.06);
    }

    this.needsGridPulse = true;
    this.gridPulseStrength = 10 + instability * 25;
    this.renderHitFlash(renderer, px, py, baseR);
  }

  // ============================================================
  // Variant 3 — "Solar Corona"
  // Many radial spike triangles radiating from ring. Sun-like
  // fuzzy halo. Hot white inner, amber tips.
  // ============================================================
  private renderCorona(renderer: Renderer): void {
    const instability = this.absorbedCount / BlackHole.MAX_ABSORB;
    const baseR = this.collisionRadius;
    const px = this.position.x;
    const py = this.position.y;
    const breath = Math.sin(this.breathPhase) * 0.06 * (1 + instability);
    const ringR = baseR * (0.75 + breath);

    // Ambient glow halo
    renderer.drawFilledCircle(px, py, baseR * (1.4 + breath), P.swirlTrail, 24, 0.03 + instability * 0.015);

    // Dark void
    renderer.drawFilledCircle(px, py, ringR * 0.88, P.voidBlack, 28, 1.0);

    // Thin bright reference ring
    const [hr, hg, hb] = P.horizonRing;
    renderer.drawCircle(px, py, ringR, [hr, hg, hb], 48, 0.4 + instability * 0.15);
    renderer.drawCircle(px, py, ringR + 1.5, [hr * 0.7, hg * 0.7, hb * 0.7], 48, 0.2);

    // Radial corona spikes (triangles pointing outward)
    const spikeCount = 48 + Math.floor(instability * 24);
    const [cor, cog, cob] = P.coronaOuter;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * TWO_PI + this.rotation * 0.1;

      // Spike length varies with noise + breath
      const noise = Math.sin(angle * 7 + this.wobbleTime * 0.004) * 0.5 + 0.5;
      const baseLen = 10 + noise * 20 + instability * 15;
      const spikeLen = baseLen * (1 + breath * 2);

      // Base half-width on ring surface
      const halfWidth = 0.03 + noise * 0.02;
      const a1 = angle - halfWidth;
      const a2 = angle + halfWidth;

      // Triangle: two points on ring, one at tip
      const bx1 = px + Math.cos(a1) * ringR;
      const by1 = py + Math.sin(a1) * ringR;
      const bx2 = px + Math.cos(a2) * ringR;
      const by2 = py + Math.sin(a2) * ringR;
      const tipR = ringR + spikeLen;
      const tx = px + Math.cos(angle) * tipR;
      const ty = py + Math.sin(angle) * tipR;

      // Asymmetric brightness (M87-style)
      const asymBright = 0.5 + 0.5 * Math.cos(angle - this.rotation * 0.2);
      const alpha = (0.15 + noise * 0.15 + instability * 0.1) * asymBright;

      // Short spikes white-hot, long spikes amber
      if (spikeLen < 20) {
        renderer.drawTriangle(bx1, by1, bx2, by2, tx, ty, 1, 1, 0.9, alpha);
      } else {
        renderer.drawTriangle(bx1, by1, bx2, by2, tx, ty, cor, cog, cob, alpha);
      }
    }

    // Orbit particles
    const [odr, odg, odb] = P.orbitDot;
    for (const hp of this.horizonParticles) {
      const r = ringR * hp.orbitR;
      const hpx = px + Math.cos(hp.angle) * r;
      const hpy = py + Math.sin(hp.angle) * r;
      renderer.drawFilledCircle(hpx, hpy, 2 + instability, [odr, odg, odb], 6, hp.brightness * 0.7);
    }

    // Swirl arms feeding ring
    this.renderSwirlArms(renderer, px, py, baseR, 4, 3.0, 0.5);

    // Infall streaks
    this.renderInfallStreaks(renderer, px, py, ringR);

    // Danger
    if (instability > 0.6) {
      const pulse = 0.5 + 0.5 * Math.sin(this.wobbleTime * 0.009);
      renderer.drawCircle(px, py, ringR + 35, [1, 0.35, 0.1], 28, (instability - 0.6) * pulse * 0.25);
    }

    this.needsGridPulse = true;
    this.gridPulseStrength = 12 + instability * 30;
    this.renderHitFlash(renderer, px, py, baseR);
  }

  // ============================================================
  // Variant 4 — "Molten Band"
  // Thick solid filled ring band. Bright inner edge, dimmer
  // outer. Hot spots flare randomly. Most solid/heavy variant.
  // ============================================================
  private renderMolten(renderer: Renderer): void {
    const instability = this.absorbedCount / BlackHole.MAX_ABSORB;
    const baseR = this.collisionRadius;
    const px = this.position.x;
    const py = this.position.y;
    const breath = Math.sin(this.breathPhase) * 0.06 * (1 + instability);
    const ringR = baseR * (0.75 + breath);

    // Outer glow halo
    renderer.drawFilledCircle(px, py, baseR * (1.3 + breath), P.swirlTrail, 24, 0.04 + instability * 0.02);

    // Dark void
    renderer.drawFilledCircle(px, py, ringR * 0.82, P.voidBlack, 28, 1.0);

    // Thick molten ring: 2 concentric bands for gradient effect
    const bandWidth = 8 + instability * 6;
    const innerR = ringR - bandWidth * 0.3;
    const outerR = ringR + bandWidth * 0.7;
    const midR = (innerR + outerR) / 2;

    // Inner band (bright, white-hot)
    this.renderThickRing(renderer, px, py, innerR, midR, P.swirlCore, 48, 0.45 + instability * 0.15);
    // Outer band (dimmer, amber)
    this.renderThickRing(renderer, px, py, midR, outerR, P.swirlArm, 48, 0.25 + instability * 0.1);

    // Hot spots: random segments flare brighter
    const segs = 48;
    for (let i = 0; i < segs; i++) {
      const hotNoise = Math.sin(i * 13.7 + this.wobbleTime * 0.005);
      if (hotNoise > 0.6) {
        const a1 = (i / segs) * TWO_PI;
        const a2 = ((i + 1) / segs) * TWO_PI;
        const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
        const cos2 = Math.cos(a2), sin2 = Math.sin(a2);
        const flareR = outerR + (hotNoise - 0.6) * 10 * (1 + instability);

        renderer.drawTriangle(
          px + cos1 * midR, py + sin1 * midR,
          px + cos2 * midR, py + sin2 * midR,
          px + cos1 * flareR, py + sin1 * flareR,
          1, 1, 0.8, (hotNoise - 0.6) * 0.5,
        );
        renderer.drawTriangle(
          px + cos2 * midR, py + sin2 * midR,
          px + cos2 * flareR, py + sin2 * flareR,
          px + cos1 * flareR, py + sin1 * flareR,
          1, 1, 0.8, (hotNoise - 0.6) * 0.5,
        );
      }
    }

    // Bright inner edge line
    renderer.drawCircle(px, py, innerR, [1, 1, 1], 48, 0.35 + instability * 0.1);

    // Orbit particles
    const [odr, odg, odb] = P.orbitDot;
    for (const hp of this.horizonParticles) {
      const r = (innerR + outerR) / 2 * hp.orbitR;
      const hpx = px + Math.cos(hp.angle) * r;
      const hpy = py + Math.sin(hp.angle) * r;
      renderer.drawFilledCircle(hpx, hpy, 2 + instability, [odr, odg, odb], 6, hp.brightness * 0.7);
    }

    // Swirl arms
    this.renderSwirlArms(renderer, px, py, baseR, 4, 3.0, 0.55);

    // Infall streaks
    this.renderInfallStreaks(renderer, px, py, ringR);

    // Danger
    if (instability > 0.6) {
      const pulse = 0.5 + 0.5 * Math.sin(this.wobbleTime * 0.008);
      renderer.drawCircle(px, py, outerR + 10, [1, 0.35, 0.1], 28, (instability - 0.6) * pulse * 0.35);
    }

    this.needsGridPulse = true;
    this.gridPulseStrength = 14 + instability * 32;
    this.renderHitFlash(renderer, px, py, baseR);
  }

  // ============================================================
  // Shared rendering helpers
  // ============================================================

  /** Draw a thick ring band between innerR and outerR using filled quads */
  private renderThickRing(
    renderer: Renderer, px: number, py: number,
    innerR: number, outerR: number,
    color: [number, number, number],
    segments: number, alpha: number,
  ): void {
    const [cr, cg, cb] = color;
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * TWO_PI;
      const a2 = ((i + 1) / segments) * TWO_PI;
      const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
      const cos2 = Math.cos(a2), sin2 = Math.sin(a2);
      const ix1 = px + cos1 * innerR, iy1 = py + sin1 * innerR;
      const ix2 = px + cos2 * innerR, iy2 = py + sin2 * innerR;
      const ox1 = px + cos1 * outerR, oy1 = py + sin1 * outerR;
      const ox2 = px + cos2 * outerR, oy2 = py + sin2 * outerR;
      renderer.drawTriangle(ix1, iy1, ix2, iy2, ox1, oy1, cr, cg, cb, alpha);
      renderer.drawTriangle(ix2, iy2, ox2, oy2, ox1, oy1, cr, cg, cb, alpha);
    }
  }

  /** Render spiral arm particles */
  private renderSwirlArms(
    renderer: Renderer, px: number, py: number, baseR: number,
    armCount: number, wrapRadians: number, alphaScale: number,
  ): void {
    const [ar, ag, ab] = P.swirlArm;
    for (const sp of this.swirlParticles) {
      const armIdx = sp.arm % armCount;
      const armBase = (armIdx / armCount) * TWO_PI + this.swirlRotation;
      const spiralAngle = armBase + sp.t * wrapRadians;
      const spiralR = baseR * (0.15 + sp.t * 1.3);
      const spx = px + Math.cos(spiralAngle) * spiralR;
      const spy = py + Math.sin(spiralAngle) * spiralR;

      const tangentAngle = spiralAngle + Math.PI * 0.5;
      const streakLen = (2.5 + sp.t * 5) * sp.size;
      const tx = Math.cos(tangentAngle) * streakLen;
      const ty = Math.sin(tangentAngle) * streakLen;

      const alpha = sp.brightness * (1 - sp.t * 0.3) * alphaScale;
      renderer.drawLine(spx - tx, spy - ty, spx + tx, spy + ty, ar, ag, ab, alpha);
    }
  }

  /** Render infall streaks falling toward ring */
  private renderInfallStreaks(renderer: Renderer, px: number, py: number, targetR: number): void {
    const [ir, ig, ib] = P.infallStreak;
    for (const s of this.infallStreaks) {
      const ca = Math.cos(s.angle);
      const sa = Math.sin(s.angle);
      const x1 = px + ca * s.r;
      const y1 = py + sa * s.r;
      const x2 = px + ca * (s.r + s.length);
      const y2 = py + sa * (s.r + s.length);
      const proximity = 1 - Math.max(0, (s.r - targetR)) / (this.collisionRadius * 1.5);
      renderer.drawLine(x1, y1, x2, y2, ir, ig, ib, s.alpha * Math.max(0.1, proximity));
    }
  }

  private renderHitFlash(renderer: Renderer, px: number, py: number, radius: number): void {
    if (this.hitFlash > 0) {
      const flashAlpha = Math.min(this.hitFlash * 3, 1);
      renderer.drawFilledCircle(px, py, radius * 1.2, [1, 1, 1], 24, flashAlpha * 0.5);
    }
  }

  /** Destabilize telegraph: pulsing, color shift, discharge arcs, warning ring */
  private renderDestabilize(renderer: Renderer): void {
    const t = this.destabilizeTimer / 1500; // 0→1 over 1.5s
    const px = this.position.x;
    const py = this.position.y;
    const baseR = this.collisionRadius;

    // Pulsing radius (±15% sinusoidal at 8Hz)
    const pulse = 1 + Math.sin(this.wobbleTime * 0.05) * 0.15 * (0.5 + t);

    // Color shift toward white/red
    const r = 1.0;
    const g = 1.0 - t * 0.6;
    const b = 1.0 - t * 0.8;

    // Growing warning ring (red, pulsing)
    const ringPulse = 0.5 + 0.5 * Math.sin(this.wobbleTime * 0.03);
    const ringR = baseR * (1.4 + t * 0.6) * pulse;
    const ringAlpha = (0.15 + t * 0.4) * ringPulse;
    renderer.drawCircle(px, py, ringR, [1, 0.2, 0.05], 32, ringAlpha);
    renderer.drawCircle(px, py, ringR * 0.95, [1, 0.4, 0.1], 32, ringAlpha * 0.5);

    // Flickering discharge arcs radiating outward
    const arcCount = 6 + Math.floor(t * 10);
    for (let i = 0; i < arcCount; i++) {
      const angle = (i / arcCount) * TWO_PI + this.wobbleTime * 0.004;
      const flicker = Math.sin(i * 17.3 + this.wobbleTime * 0.02);
      if (flicker < 0.2 - t * 0.5) continue; // skip some arcs, more show as t grows
      const innerR = baseR * 0.8;
      const outerR = baseR * (1.2 + t * 0.8 + flicker * 0.3);
      const arcAlpha = (0.3 + t * 0.5) * Math.max(0, flicker);
      renderer.drawLine(
        px + Math.cos(angle) * innerR, py + Math.sin(angle) * innerR,
        px + Math.cos(angle + 0.05) * outerR, py + Math.sin(angle + 0.05) * outerR,
        r, g, b, arcAlpha,
      );
    }

    // Inner color shift glow
    renderer.drawFilledCircle(px, py, baseR * 0.6, [r, g * 0.3, b * 0.1], 20, t * 0.15);
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    for (let i = 0; i < 4; i++) {
      const phase = (time * 0.6 + i * 0.25) % 1.0;
      const ringR = this.collisionRadius + phase * 60;
      const alpha = (1 - phase) * 0.15;
      renderer.drawCircle(this.position.x, this.position.y, ringR, [alpha * 2, alpha * 0.7, alpha * 0.2], 28);
    }
  }

  onDeath(): EnemyDeathResult {
    return {};
  }
}

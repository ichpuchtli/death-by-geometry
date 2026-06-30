import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { TrailSystem } from './renderer/trails';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { AudioManager } from './core/audio';
import { HUD } from './ui/hud';
import { Starfield } from './renderer/starfield';
import { ExplosionPool } from './entities/explosion';
import { Enemy } from './entities/enemies/enemy';
import { BlackHole, BlackHoleVisualMode } from './entities/enemies/blackhole';
import { CircleEnemy } from './entities/enemies/circle';
import { Rhombus } from './entities/enemies/rhombus';
import { Pinwheel } from './entities/enemies/pinwheel';
import { Sierpinski } from './entities/enemies/sierpinski';
import { Vec2 } from './core/vector';
import { TRAIL_LENGTH_ENEMY, EXPLOSION_DURATION_DEFAULT, BLACKHOLE_PALETTE } from './config';
import { gameSettings } from './settings';

type SpawnableType = 'rhombus' | 'pinwheel' | 'sierpinski' | 'blackhole';
type ExplosionStyle = 'shockwave' | 'nova' | 'implosion' | 'jets';

const SPAWNABLE_TYPES: SpawnableType[] = ['rhombus', 'pinwheel', 'sierpinski', 'blackhole'];

const SPAWNABLE_COLORS: Record<SpawnableType, string> = {
  rhombus: '#00c8ff',
  pinwheel: '#c840ff',
  sierpinski: '#ffd700',
  blackhole: '#66b3ff',
};

interface LabBlackHole {
  bh: BlackHole;
  label: string;
  sublabel: string;
  mode: BlackHoleVisualMode;
  explosionStyle: ExplosionStyle;
  worldX: number;
  worldY: number;
  respawnTimer: number;
}

interface PendingEffect {
  delay: number;
  action: () => void;
}

/** Design Lab: visual sandbox for comparing BlackHole explosion variants */
export class DesignLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private trails: TrailSystem;
  private camera: Camera;
  private input: Input;
  private audio: AudioManager;
  private hud: HUD;
  private starfield: Starfield;
  private explosions: ExplosionPool;

  private labHoles: LabBlackHole[] = [];
  private enemies: Enemy[] = [];
  private pendingEffects: PendingEffect[] = [];
  private totalTime = 0;
  private selectedTypeIdx = 0;
  private active = false;

  constructor(
    renderer: Renderer,
    bloom: BloomPass,
    grid: SpringMassGrid,
    trails: TrailSystem,
    camera: Camera,
    input: Input,
    audio: AudioManager,
    hud: HUD,
    starfield: Starfield,
  ) {
    this.renderer = renderer;
    this.bloom = bloom;
    this.grid = grid;
    this.trails = trails;
    this.camera = camera;
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.starfield = starfield;
    this.explosions = new ExplosionPool();
  }

  get selectedType(): SpawnableType {
    return SPAWNABLE_TYPES[this.selectedTypeIdx];
  }

  enter(): void {
    this.exit();
    this.totalTime = 0;
    this.active = true;

    this.grid.rebuild(gameSettings.arenaWidth, gameSettings.arenaHeight, gameSettings.gridSpacing);

    // 4 Molten Band BHs — each with a different explosion style
    const positions: { x: number; y: number; style: ExplosionStyle; label: string }[] = [
      { x: -300, y: 180, style: 'shockwave', label: 'Shockwave' },
      { x: 300, y: 180, style: 'nova', label: 'Nova' },
      { x: -300, y: -180, style: 'implosion', label: 'Implosion' },
      { x: 300, y: -180, style: 'jets', label: 'Radial Jets' },
    ];

    for (const p of positions) {
      const bh = new BlackHole();
      bh.position.x = p.x;
      bh.position.y = p.y;
      bh.visualMode = 'molten';
      bh.active = true;
      bh.spawnTimer = 0;
      bh.trailId = this.trails.register(bh.color, TRAIL_LENGTH_ENEMY);
      this.enemies.push(bh);

      this.labHoles.push({
        bh,
        label: p.label,
        sublabel: 'Mass: 0/12',
        mode: 'molten',
        explosionStyle: p.style,
        worldX: p.x,
        worldY: p.y,
        respawnTimer: 0,
      });
    }

    this.camera.snapTo(new Vec2(0, 0));
  }

  exit(): void {
    for (const e of this.enemies) {
      if (e.trailId >= 0) this.trails.unregister(e.trailId);
    }
    this.enemies = [];
    this.labHoles = [];
    this.pendingEffects = [];
    this.explosions.clear();
    this.trails.clear();
    this.active = false;
  }

  update(dt: number): void {
    this.totalTime += dt / 1000;

    // Process pending effects (delayed explosions, staggered circle spawns)
    for (let i = this.pendingEffects.length - 1; i >= 0; i--) {
      this.pendingEffects[i].delay -= dt;
      if (this.pendingEffects[i].delay <= 0) {
        this.pendingEffects[i].action();
        this.pendingEffects.splice(i, 1);
      }
    }

    // Handle BH respawn timers
    for (const lh of this.labHoles) {
      if (lh.respawnTimer > 0) {
        lh.respawnTimer -= dt;
        if (lh.respawnTimer <= 0) {
          lh.respawnTimer = 0;
          this.respawnLabBlackHole(lh);
        }
      }
    }

    // Update all enemies (BHs + spawned enemies)
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.isSpawning) {
        e.spawnTimer = Math.max(0, e.spawnTimer - dt / 1000);
        // Move spawning entities along velocity (ejected circles fly outward)
        if (e.velocity.x !== 0 || e.velocity.y !== 0) {
          e.position.addScaledMut(e.velocity, dt);
          // Decelerate ejection
          const damp = 1 - 0.003 * dt;
          e.velocity.x *= damp;
          e.velocity.y *= damp;
        }
        if (e.trailId >= 0) this.trails.update(e.trailId, e.position.x, e.position.y);
        continue;
      }

      if (e instanceof BlackHole) {
        e.update(dt);
        if (e.needsGridPulse) {
          this.grid.applyImpulse(e.position.x, e.position.y, e.gridPulseStrength, 150);
          e.needsGridPulse = false;
        }
      } else {
        // Non-BH enemies: find nearest active BH and follow it
        let nearestBH: BlackHole | null = null;
        let nearestDist = Infinity;
        for (const lh of this.labHoles) {
          if (!lh.bh.active) continue;
          const dx = lh.bh.position.x - e.position.x;
          const dy = lh.bh.position.y - e.position.y;
          const d = dx * dx + dy * dy;
          if (d < nearestDist) {
            nearestDist = d;
            nearestBH = lh.bh;
          }
        }
        if (nearestBH) {
          (e as { update(dt: number, playerPos?: Vec2): void }).update(dt, nearestBH.position);
        }
      }

      if (e.trailId >= 0) {
        this.trails.update(e.trailId, e.position.x, e.position.y);
      }
    }

    // BlackHole attraction: pull non-BH enemies toward nearest BH
    for (const lh of this.labHoles) {
      const bh = lh.bh;
      if (!bh.active) continue;

      const attractR2 = BlackHole.ATTRACT_RADIUS * BlackHole.ATTRACT_RADIUS;
      const absorbR2 = (bh.collisionRadius + 10) * (bh.collisionRadius + 10);

      for (const e of this.enemies) {
        if (!e.active || e.isSpawning || e === bh || e instanceof BlackHole || e.gravityImmune) continue;

        const dx = bh.position.x - e.position.x;
        const dy = bh.position.y - e.position.y;
        const dist2 = dx * dx + dy * dy;

        // Absorb on contact
        if (dist2 < absorbR2 && bh.absorbedCount < BlackHole.MAX_ABSORB) {
          e.active = false;
          bh.absorbEnemy();
          if (e.trailId >= 0) this.trails.unregister(e.trailId);
          this.explosions.spawn(e.position.x, e.position.y, e.color, 15, 0.6);
          this.grid.applyImpulse(e.position.x, e.position.y, -20, 120);

          // Overload explosion
          if (bh.overloaded) {
            this.triggerOverloadExplosion(bh, lh);
          }
          continue;
        }

        // Attract within radius
        if (dist2 < attractR2 && dist2 > 1) {
          const dist = Math.sqrt(dist2);
          const force = BlackHole.GRAVITY_STRENGTH * dt / dist;
          e.position.x += dx / dist * force;
          e.position.y += dy / dist * force;
        }
      }

      // Update label
      if (bh.active) {
        lh.sublabel = `Mass: ${bh.absorbedCount}/${BlackHole.MAX_ABSORB}`;
      }
    }

    // Gravity wells for grid warping
    for (const lh of this.labHoles) {
      const bh = lh.bh;
      if (!bh.active) continue;
      const mass = -(gameSettings.bhGridMassBase + bh.absorbedCount * gameSettings.bhGridMassPerAbsorb) * bh.breathMassMultiplier;
      this.grid.applyGravityWell(bh.position.x, bh.position.y, mass, BlackHole.ATTRACT_RADIUS * gameSettings.bhGridRadiusMultiplier);
    }

    // Enemy micro-forces on grid
    for (const e of this.enemies) {
      if (!e.active || e.isSpawning || e instanceof BlackHole) continue;
      const speed = e.velocity.magnitude();
      if (speed > 0.01) {
        this.grid.applyImpulse(e.position.x, e.position.y, speed * 2, 80);
      }
    }

    this.grid.update(dt);
    this.explosions.update(dt);

    // Clean up inactive enemies
    this.enemies = this.enemies.filter(e => {
      if (!e.active && e.trailId >= 0) {
        this.trails.unregister(e.trailId);
      }
      return e.active;
    });
  }

  // ============================================================
  // Overload explosion dispatch
  // ============================================================
  private triggerOverloadExplosion(bh: BlackHole, lh: LabBlackHole): void {
    bh.active = false;
    if (bh.trailId >= 0) this.trails.unregister(bh.trailId);

    const px = bh.position.x;
    const py = bh.position.y;
    const absorbed = bh.absorbedCount;

    // Dispatch to explosion style — each handles its own circle ejection timing
    switch (lh.explosionStyle) {
      case 'shockwave': this.explodeShockwave(px, py, absorbed); break;
      case 'nova': this.explodeNova(px, py, absorbed); break;
      case 'implosion': this.explodeImplosion(px, py, absorbed); break;
      case 'jets': this.explodeJets(px, py, absorbed); break;
    }

    lh.sublabel = 'OVERLOADED — respawning...';
    lh.respawnTimer = 3500;
  }

  /** Eject a single circle from the explosion center with outward velocity */
  private ejectCircle(px: number, py: number, angle: number, ejectSpeed: number): void {
    const ce = new CircleEnemy(new Vec2(px, py));
    ce.spawnDuration = 0.5;
    ce.spawnTimer = 0.5;
    ce.speed *= gameSettings.enemySpeedMultiplier;
    ce.ejectVel.set(Math.cos(angle) * ejectSpeed, Math.sin(angle) * ejectSpeed);
    ce.trailId = this.trails.register(ce.color, TRAIL_LENGTH_ENEMY);
    this.enemies.push(ce);
  }

  // --- Style 1: Shockwave ---
  // Clean shockwave ring carries the circles outward with it.
  // Circles ejected fast and hard, riding the wave.
  private explodeShockwave(px: number, py: number, absorbed: number): void {
    const P = BLACKHOLE_PALETTE;

    // Central flash
    this.explosions.spawn(px, py, [1, 1, 1], 30, 0.4, 2.0);

    // Massive grid rebound
    this.grid.applyImpulse(px, py, 2500, 550);
    this.camera.shake(0.8);

    // Circles ejected by the shockwave — fast burst, slight stagger
    for (let i = 0; i < absorbed; i++) {
      const angle = (i / absorbed) * Math.PI * 2;
      const delay = i * 15; // tight 15ms stagger — like a ring expanding
      this.pendingEffects.push({
        delay,
        action: () => {
          this.ejectCircle(px, py, angle, 0.45 + Math.random() * 0.1);
          // Per-circle ejection spark aligned to direction
          const sparkX = px + Math.cos(angle) * 15;
          const sparkY = py + Math.sin(angle) * 15;
          this.explosions.spawn(sparkX, sparkY, P.swirlArm, 6, 0.3, 2.0);
        },
      });
    }

    // Ring of particles following the shockwave (after all circles ejected)
    this.pendingEffects.push({
      delay: absorbed * 15 + 50,
      action: () => {
        this.explosions.spawn(px, py, P.swirlArm, 60, 0.8, 1.8);
        this.grid.applyImpulse(px, py, 600, 400);
      },
    });
  }

  // --- Style 2: Nova ---
  // Massive sustained eruption. Circles emerge from the expanding
  // fireball over a longer window — born from the inferno.
  private explodeNova(px: number, py: number, absorbed: number): void {
    const P = BLACKHOLE_PALETTE;

    // Layered particle burst
    this.explosions.spawn(px, py, [1, 1, 0.9], 120, 0.6, 2.5);
    this.explosions.spawn(px, py, P.swirlArm, 200, EXPLOSION_DURATION_DEFAULT * 2, 1.2);
    this.explosions.spawn(px, py, P.swirlCore, 60, 0.8, 0.8);

    // Grid rebound
    this.grid.applyImpulse(px, py, 1800, 450);
    this.camera.shake(0.6);

    // Circles emerge gradually from the fireball — longer stagger
    for (let i = 0; i < absorbed; i++) {
      const angle = (i / absorbed) * Math.PI * 2 + Math.random() * 0.3;
      const delay = 80 + i * 30; // 80ms initial delay, then 30ms apart
      this.pendingEffects.push({
        delay,
        action: () => {
          this.ejectCircle(px, py, angle, 0.3 + Math.random() * 0.15);
          // Each circle emerges with a puff of embers
          this.explosions.spawn(px, py, P.coronaOuter, 10, 0.5, 1.0);
        },
      });
    }

    // Late ember cloud
    this.pendingEffects.push({
      delay: 500,
      action: () => {
        this.explosions.spawn(px, py, P.swirlTrail, 80, EXPLOSION_DURATION_DEFAULT * 3, 0.5);
        this.grid.applyImpulse(px, py, 300, 300);
      },
    });
  }

  // --- Style 3: Implosion ---
  // 7-phase theatrical supernova. Grid collapses under its own weight
  // with building tension, compresses to a singularity point, then
  // violently snaps outward — circles ejected as debris from the blast.
  private explodeImplosion(px: number, py: number, absorbed: number): void {
    const P = BLACKHOLE_PALETTE;

    // ── Phase 1 (0ms): COLLAPSE BEGINS ──
    // Gravity collapse SFX: building rumble + sucking noise
    this.audio.playGravityCollapse();
    // Gentle initial inward pull — fabric starts sagging
    this.grid.applyImpulse(px, py, -500, 350);
    this.explosions.spawn(px, py, P.voidBlack, 20, 0.4, 0.3);
    this.camera.shake(0.15);

    // ── Phase 2 (120ms): COLLAPSE DEEPENS ──
    this.pendingEffects.push({
      delay: 120,
      action: () => {
        this.grid.applyImpulse(px, py, -900, 400);
        this.explosions.spawn(px, py, P.voidBlack, 30, 0.3, 0.4);
        this.camera.shake(0.25);
      },
    });

    // ── Phase 3 (250ms): COLLAPSE PEAK — maximum inward force ──
    this.pendingEffects.push({
      delay: 250,
      action: () => {
        this.grid.applyImpulse(px, py, -1400, 450);
        this.explosions.spawn(px, py, P.voidBlack, 50, 0.25, 0.2);
        this.camera.shake(0.35);
      },
    });

    // ── Phase 4 (400ms): COMPRESSION — singularity point ──
    // Brief white-hot compression at center before the snap
    this.pendingEffects.push({
      delay: 400,
      action: () => {
        this.explosions.spawn(px, py, [1, 1, 1], 15, 0.15, 0.3);
        this.explosions.spawn(px, py, P.swirlCore, 10, 0.2, 0.2);
      },
    });

    // ── Phase 5 (500ms): REBOUND — everything snaps outward ──
    this.pendingEffects.push({
      delay: 500,
      action: () => {
        // Rebound SFX: massive bass impact + bright scatter
        this.audio.playGravityRebound();

        // MASSIVE outward grid snap
        this.grid.applyImpulse(px, py, 3500, 600);
        this.camera.shake(1.0);

        // Core explosion: white-hot flash
        this.explosions.spawn(px, py, [1, 1, 1], 120, 0.5, 3.0);
        // Amber debris burst
        this.explosions.spawn(px, py, P.swirlArm, 180, EXPLOSION_DURATION_DEFAULT * 1.5, 1.8);
        // Hot inner glow
        this.explosions.spawn(px, py, P.swirlCore, 50, 0.6, 1.0);

        // ALL circles eject simultaneously — born from the rebound
        for (let i = 0; i < absorbed; i++) {
          const angle = (i / absorbed) * Math.PI * 2;
          this.ejectCircle(px, py, angle, 0.5 + Math.random() * 0.15);
          // Per-circle directional spark
          const sparkX = px + Math.cos(angle) * 12;
          const sparkY = py + Math.sin(angle) * 12;
          this.explosions.spawn(sparkX, sparkY, [0.1, 0.8, 0.6], 8, 0.4, 2.5);
        }
      },
    });

    // ── Phase 6 (750ms): SECONDARY SHOCKWAVE ──
    this.pendingEffects.push({
      delay: 750,
      action: () => {
        this.grid.applyImpulse(px, py, 900, 450);
        this.explosions.spawn(px, py, P.coronaOuter, 50, EXPLOSION_DURATION_DEFAULT, 1.2);
        this.camera.shake(0.3);
      },
    });

    // ── Phase 7 (1100ms): AFTERSHOCK RIPPLE ──
    this.pendingEffects.push({
      delay: 1100,
      action: () => {
        this.grid.applyImpulse(px, py, 400, 350);
        this.explosions.spawn(px, py, P.swirlTrail, 40, EXPLOSION_DURATION_DEFAULT * 2.5, 0.4);
      },
    });
  }

  // --- Style 4: Radial Jets ---
  // Circles ejected along specific jet directions.
  // Each jet carries 1-2 circles. Structured, geometric.
  private explodeJets(px: number, py: number, absorbed: number): void {
    const P = BLACKHOLE_PALETTE;
    const jetCount = 8;
    const jetDist = 60;

    // Central flash
    this.explosions.spawn(px, py, [1, 1, 1], 40, 0.5, 1.5);
    this.grid.applyImpulse(px, py, 1500, 400);
    this.camera.shake(0.5);

    // 8 jets fire in sequence — circles ride the jets
    let circleIdx = 0;
    for (let j = 0; j < jetCount; j++) {
      const jetAngle = (j / jetCount) * Math.PI * 2 + this.totalTime * 0.1;
      const delay = j * 35; // rapid sequential fire

      this.pendingEffects.push({
        delay,
        action: () => {
          const jx = px + Math.cos(jetAngle) * jetDist;
          const jy = py + Math.sin(jetAngle) * jetDist;

          // Jet explosion
          this.explosions.spawn(jx, jy, P.swirlArm, 20, 0.6, 1.5);
          // Jet trail from center to jet point
          this.explosions.spawn(px, py, P.coronaOuter, 8, 0.4, 2.0);
          // Grid impulse at jet tip
          this.grid.applyImpulse(jx, jy, 350, 140);

          // Eject 1-2 circles along this jet direction
          if (circleIdx < absorbed) {
            this.ejectCircle(px, py, jetAngle, 0.4 + Math.random() * 0.1);
            circleIdx++;
          }
          if (circleIdx < absorbed && j % 2 === 0) {
            // Second circle slightly offset angle
            this.ejectCircle(px, py, jetAngle + 0.15, 0.35 + Math.random() * 0.1);
            circleIdx++;
          }
        },
      });
    }

    // Remaining circles in a final burst
    this.pendingEffects.push({
      delay: jetCount * 35 + 100,
      action: () => {
        while (circleIdx < absorbed) {
          const angle = Math.random() * Math.PI * 2;
          this.ejectCircle(px, py, angle, 0.3 + Math.random() * 0.15);
          circleIdx++;
        }
        this.explosions.spawn(px, py, P.swirlTrail, 30, 0.8, 0.6);
      },
    });
  }

  // ============================================================
  // Spawn effect — fabric collapse when BH appears
  // ============================================================
  private respawnLabBlackHole(lh: LabBlackHole): void {
    if (!this.active) return;
    const newBh = new BlackHole();
    newBh.position.x = lh.worldX;
    newBh.position.y = lh.worldY;
    newBh.visualMode = lh.mode;
    newBh.active = true;
    newBh.spawnTimer = 1.0;
    newBh.spawnDuration = 1.0;
    newBh.trailId = this.trails.register(newBh.color, TRAIL_LENGTH_ENEMY);
    this.enemies.push(newBh);
    lh.bh = newBh;
    lh.sublabel = 'Spawning...';

    // Fabric collapse: grid pulls inward as the well forms
    this.grid.applyImpulse(lh.worldX, lh.worldY, -800, 350);
    this.camera.shake(0.15);

    // Secondary inward pull as spawn completes
    this.pendingEffects.push({
      delay: 500,
      action: () => {
        this.grid.applyImpulse(lh.worldX, lh.worldY, -400, 250);
        lh.sublabel = 'Mass: 0/12';
      },
    });
  }

  render(): void {
    const cameraX = this.camera.renderX;
    const cameraY = this.camera.renderY;
    this.renderer.cameraX = cameraX;
    this.renderer.cameraY = cameraY;

    this.bloom.shakeIntensity = this.camera.shakeNormalized;
    this.bloom.time = this.totalTime;

    // --- Render to bloom scene FBO ---
    this.bloom.bindSceneFBO();

    // 1. Grid
    this.grid.render(cameraX, cameraY, this.renderer.width, this.renderer.height);

    // 2. Starfield
    this.renderer.begin(false);
    this.starfield.render(this.renderer, cameraX, cameraY);
    this.renderer.end();

    // 3. Arena border + Entities — NORMAL blend
    this.renderer.begin(false);
    this.renderArenaBorder();

    for (const e of this.enemies) {
      e.render(this.renderer);
    }

    // 4. Switch to additive blend for trails, explosions
    this.renderer.setBlendMode('additive');
    this.trails.render(this.renderer);
    this.explosions.render(this.renderer);
    this.renderer.setBlendMode('normal');
    this.renderer.end();

    // --- Bloom post-process ---
    this.bloom.apply(this.renderer.canvasWidth, this.renderer.canvasHeight);

    // --- HUD overlay ---
    this.hud.clear();

    const labels: { text: string; subtext: string; screenX: number; screenY: number }[] = [];
    for (const lh of this.labHoles) {
      const screenX = (lh.worldX - cameraX) * this.renderer.zoom + this.renderer.canvasWidth / (window.devicePixelRatio || 1) / 2;
      const screenY = -(lh.worldY - cameraY) * this.renderer.zoom + this.renderer.canvasHeight / (window.devicePixelRatio || 1) / 2;
      labels.push({
        text: lh.label,
        subtext: lh.sublabel,
        screenX,
        screenY: screenY - 70,
      });
    }
    this.hud.drawDesignLabLabels(labels);
    this.hud.drawDesignLabOverlay(this.selectedType, SPAWNABLE_COLORS[this.selectedType]);
  }

  onClick(): void {
    const mouseWorld = this.input.getMouseWorldPos();
    const type = this.selectedType;

    let enemy: Enemy;
    switch (type) {
      case 'rhombus': enemy = new Rhombus(); break;
      case 'pinwheel': enemy = new Pinwheel(); break;
      case 'sierpinski': enemy = new Sierpinski(); break;
      case 'blackhole': {
        const bh = new BlackHole();
        bh.position.x = mouseWorld.x;
        bh.position.y = mouseWorld.y;
        bh.visualMode = 'molten';
        bh.active = true;
        bh.spawnTimer = 0;
        bh.trailId = this.trails.register(bh.color, TRAIL_LENGTH_ENEMY);
        this.enemies.push(bh);
        this.grid.applyImpulse(mouseWorld.x, mouseWorld.y, -600, 300);
        this.camera.shake(0.15);
        return;
      }
      default: enemy = new Rhombus(); break;
    }

    enemy.position.x = mouseWorld.x;
    enemy.position.y = mouseWorld.y;
    enemy.active = true;
    enemy.spawnTimer = 0;
    enemy.speed *= gameSettings.enemySpeedMultiplier;
    enemy.trailId = this.trails.register(enemy.color, TRAIL_LENGTH_ENEMY);
    this.enemies.push(enemy);
    this.grid.applyImpulse(mouseWorld.x, mouseWorld.y, 80, 120);
  }

  onKeyDown(code: string): void {
    switch (code) {
      case 'Digit1': this.selectedTypeIdx = 0; break;
      case 'Digit2': this.selectedTypeIdx = 1; break;
      case 'Digit3': this.selectedTypeIdx = 2; break;
      case 'Digit4': this.selectedTypeIdx = 3; break;
      case 'Digit5': this.selectedTypeIdx = 4; break;
    }
  }

  private renderArenaBorder(): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    const a = 0.6;
    this.renderer.drawLine(-hw, -hh, hw, -hh, 0, 0.4, 0.8, a);
    this.renderer.drawLine(hw, -hh, hw, hh, 0, 0.4, 0.8, a);
    this.renderer.drawLine(hw, hh, -hw, hh, 0, 0.4, 0.8, a);
    this.renderer.drawLine(-hw, hh, -hw, -hh, 0, 0.4, 0.8, a);
  }
}

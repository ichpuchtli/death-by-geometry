import {
  PLAYER_STARTING_LIVES,
  BLOOM_INTENSITY,
  BLOOM_THRESHOLD,
  BLOOM_BLUR_PASSES,
  BLOOM_BLUR_RADIUS,
  TRAIL_LENGTH_ENEMY,
  MOBILE_MAX_ENEMIES,
  GRID_ANCHOR_STIFFNESS,
  GRID_SPRING_DAMPING,
  GRID_MAX_DISPLACEMENT,
  GRID_SPACING,
  GRID_SUBSTEPS,
  GRID_SPRING_STIFFNESS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from './config';

export interface GameSettings {
  spawnRateMultiplier: number;    // 0.5–2.0 (scales spawn intervals; lower = more enemies)
  startingLives: number;          // 1–10
  playerSpeedMultiplier: number;  // 0.5–2.0
  fireRateMultiplier: number;     // 0.5–3.0 (divides shot delay; higher = faster fire)
  startingPhase: string;          // 'tutorial'|'rampUp'|'midGame'|'intense'|'chaos'
  enemySpeedMultiplier: number;   // 0.5–2.0
  maxEnemies: number;             // 20–150
  bloomIntensity: number;         // 0.5–4.0
  trailLength: number;            // 2–30
  // BlackHole gravity tuning
  bhAttractRadius: number;        // 50–600 (px, how far gravity reaches)
  bhEnemyPull: number;            // 0.1–5.0 (px/ms², enemy pull strength)
  bhPlayerPull: number;           // 0.0–5.0 (px/ms², player pull strength)
  bhGridMassBase: number;         // 0–800 (grid well depth at 0 absorbed)
  bhGridMassPerAbsorb: number;    // 0–100 (additional grid depth per absorbed enemy)
  bhGridRadiusMultiplier: number; // 0.5–5.0 (grid well radius as multiple of attract radius)
  bhGridPerspectiveDepth: number; // 0.0–1.0 (strength of 3D spacetime depression illusion)
  // Grid physics tuning
  gridAnchorStiffness: number;    // 1–100 (spring return-to-rest strength)
  gridDamping: number;            // 1–20 (velocity damping)
  gridMaxDisplacement: number;    // 20–200 (max px displacement from rest)
  vulnerableDuringSpawn: boolean; // false = spawn invulnerability (default), true = can be shot during spawn
  aiWingman: boolean;             // true = spawn an AI-controlled ally that fights beside the player
  // GPU Stress / Arena
  arenaWidth: number;             // 800–6400 (world width in px)
  arenaHeight: number;            // 500–4000 (world height in px)
  gridSpacing: number;            // 10–80 (px between grid nodes)
  gridSubsteps: number;           // 1–8 (physics substeps per frame)
  gridSpringStiffness: number;    // 100–3000 (neighbor spring strength)
  bloomThreshold: number;         // 0.01–0.5 (brightness extract cutoff)
  bloomBlurPasses: number;        // 1–12 (Gaussian blur iterations)
  bloomBlurRadius: number;        // 0.5–6.0 (blur kernel size)
  resolutionScale: number;        // 0.25–2.0 (multiplier on device pixel ratio)
  zoomScale: number;              // 0.5–1.5 (camera zoom multiplier; lower = see more arena)
}

export const DEFAULTS: GameSettings = {
  spawnRateMultiplier: 1.0,
  startingLives: PLAYER_STARTING_LIVES,
  playerSpeedMultiplier: 1.0,
  fireRateMultiplier: 1.0,
  startingPhase: 'tutorial',
  enemySpeedMultiplier: 1.0,
  maxEnemies: MOBILE_MAX_ENEMIES,
  bloomIntensity: BLOOM_INTENSITY,
  trailLength: TRAIL_LENGTH_ENEMY,
  bhAttractRadius: 450,
  bhEnemyPull: 4.0,
  bhPlayerPull: 5.0,
  bhGridMassBase: 600,
  bhGridMassPerAbsorb: 40,
  bhGridRadiusMultiplier: 3.0,
  bhGridPerspectiveDepth: 0.8,
  gridAnchorStiffness: GRID_ANCHOR_STIFFNESS,
  gridDamping: GRID_SPRING_DAMPING,
  gridMaxDisplacement: GRID_MAX_DISPLACEMENT,
  vulnerableDuringSpawn: false,
  aiWingman: false,
  arenaWidth: WORLD_WIDTH,
  arenaHeight: WORLD_HEIGHT,
  gridSpacing: GRID_SPACING,
  gridSubsteps: GRID_SUBSTEPS,
  gridSpringStiffness: GRID_SPRING_STIFFNESS,
  bloomThreshold: BLOOM_THRESHOLD,
  bloomBlurPasses: BLOOM_BLUR_PASSES,
  bloomBlurRadius: BLOOM_BLUR_RADIUS,
  resolutionScale: 1.0,
  zoomScale: 1.0,
};

const STORAGE_KEY = 'gg_settings';

export const gameSettings: GameSettings = { ...DEFAULTS };

export function loadSettings(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(DEFAULTS) as (keyof GameSettings)[]) {
        if (key in parsed) {
          (gameSettings as unknown as Record<string, unknown>)[key] = parsed[key];
        }
      }
    }
  } catch {
    // corrupt data — use defaults
  }
}

export function saveSettings(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameSettings));
  } catch {
    // storage full or unavailable
  }
}

export function resetSettings(): void {
  Object.assign(gameSettings, DEFAULTS);
  saveSettings();
}

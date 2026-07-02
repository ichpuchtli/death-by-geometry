// --- Enemy colors [r, g, b] normalized 0-1 ---
export const COLORS = {
  rhombus:  { color: [0, 0.784, 1.0] as [number, number, number], color2: [0, 0.549, 0.784] as [number, number, number] },
  pinwheel: { color: [0.784, 0.251, 1.0] as [number, number, number], color2: [0.298, 0, 0.722] as [number, number, number] },
  circle:   { color: [0.125, 0.251, 1.0] as [number, number, number], color2: [0.196, 0.784, 1.0] as [number, number, number] },
  triangle: { color: [0.682, 0.796, 0.0] as [number, number, number], color2: [0, 0.502, 0] as [number, number, number] },
  blackhole:{ color: [0.4, 0.7, 1.0] as [number, number, number], color2: [0.1, 0.9, 1.0] as [number, number, number] },
  // --- New fractal/topology enemies ---
  sierpinski:     { color: [1.0, 0.843, 0.0] as [number, number, number], color2: [0.722, 0.525, 0.043] as [number, number, number] },
  mobius:         { color: [0.0, 1.0, 0.784] as [number, number, number], color2: [0.0, 0.533, 0.4] as [number, number, number] },
  koch:           { color: [0.533, 0.867, 1.0] as [number, number, number], color2: [1.0, 1.0, 1.0] as [number, number, number] },
  penrose:        { color: [1.0, 0.078, 0.576] as [number, number, number], color2: [0.58, 0.0, 0.827] as [number, number, number] },
  mengerdust:     { color: [1.0, 0.4, 0.0] as [number, number, number], color2: [0.6, 0.2, 0.0] as [number, number, number] },
  hyperbolicdisc: { color: [0.0, 0.267, 1.0] as [number, number, number], color2: [0.102, 0.0, 0.4] as [number, number, number] },
  fibspiral:      { color: [0.667, 1.0, 0.0] as [number, number, number], color2: [0.333, 0.533, 0.0] as [number, number, number] },
  tesseract:      { color: [0.667, 0.0, 1.0] as [number, number, number], color2: [1.0, 0.0, 0.667] as [number, number, number] },
  mandelbrot:     { color: [0.8, 0.0, 0.0] as [number, number, number], color2: [0.267, 0.0, 0.0] as [number, number, number] },
  klein:          { color: [0.0, 1.0, 0.667] as [number, number, number], color2: [0.0, 0.4, 0.267] as [number, number, number] },
  shard:          { color: [1.0, 0.9, 0.3] as [number, number, number], color2: [0.8, 0.7, 0.1] as [number, number, number] },
  minimandel:     { color: [1.0, 0.2, 0.2] as [number, number, number], color2: [0.5, 0.0, 0.0] as [number, number, number] },
};

// --- Enemy speeds (px/ms) ---
export const ENEMY_SPEED = {
  rhombus: 0.15,
  pinwheel: 0.05,
  circle: 0.35,
  triangle: 0.2,
  blackhole: 0,
  // --- New enemies ---
  sierpinski: 0.12,
  mobius: 0.18,
  koch: 0.12,
  penrose: 0.14,
  mengerdust: 0.06,
  hyperbolicdisc: 0.10,
  fibspiral: 0.22,
  tesseract: 0.09,
  mandelbrot: 0.04,
  klein: 0.13,
  shard: 0.3,
  minimandel: 0.25,
};

// --- Enemy scores ---
export const ENEMY_SCORES = {
  rhombus: 100,
  pinwheel: 50,
  circle: 300,
  triangle: 550,
  blackhole: 2000,
  // --- New enemies ---
  sierpinski: 2400,
  mobius: 900,
  koch: 1200,
  penrose: 1500,
  mengerdust: 3200,
  hyperbolicdisc: 2000,
  fibspiral: 600,
  tesseract: 2800,
  mandelbrot: 4000,
  klein: 1800,
  shard: 100,
  minimandel: 150,
};

// --- Enemy HP ---
export const MOBIUS_HP = 1;
export const KOCH_HP = 2;
export const PENROSE_HP = 2;
export const MENGERDUST_HP = 5;
export const HYPERBOLICDISC_HP = 3;
export const TESSERACT_HP = 4;
export const MANDELBROT_HP = 6;
export const KLEIN_HP = 3;

// --- MengerDust ---
export const MENGERDUST_ABSORB_COUNT = 3;
export const MENGERDUST_OVERLOAD_DURATION = 1.0; // seconds

// --- Mandelbrot ---
export const MANDELBROT_MAX_MINIONS = 4;
export const MANDELBROT_SPAWN_INTERVAL = 5.0; // seconds
export const MANDELBROT_BUD_REGROW_TIME = 3.0; // seconds

// --- BlackHole ---
export const BLACKHOLE_HP = 8;

// --- BlackHole Visual Palette (design lab variants) ---
export const BLACKHOLE_PALETTE = {
  // Shared
  singularity: [1.0, 1.0, 0.95] as [number, number, number],
  voidBlack:   [0.02, 0.01, 0.03] as [number, number, number],
  // Radiant Collapse
  rayInner:    [1.0, 0.95, 0.85] as [number, number, number],
  rayOuter:    [1.0, 0.6, 0.15] as [number, number, number],
  // Swirl
  swirlArm:    [1.0, 0.7, 0.2] as [number, number, number],
  swirlCore:   [1.0, 0.9, 0.7] as [number, number, number],
  swirlTrail:  [0.6, 0.3, 0.05] as [number, number, number],
  // Unstable Mass
  arcEnergy:   [1.0, 0.85, 0.4] as [number, number, number],
  unstableEdge:[1.0, 0.5, 0.1] as [number, number, number],
  crackle:     [1.0, 1.0, 0.7] as [number, number, number],
  // Event Horizon
  horizonRing: [1.0, 0.85, 0.5] as [number, number, number],
  coronaOuter: [1.0, 0.5, 0.15] as [number, number, number],
  infallStreak:[0.8, 0.5, 0.15] as [number, number, number],
  orbitDot:    [1.0, 0.95, 0.8] as [number, number, number],
};
export const BLACKHOLE_PLAYER_PULL_STRENGTH = 0.4; // px/ms² force on player

// --- Supernova (BlackHole overload detonation) ---
export const SUPERNOVA_PARTICLE_COUNT = 400;
export const SUPERNOVA_GRID_IMPULSE = 2500;
export const SUPERNOVA_HITSTOP = 300;
export const SUPERNOVA_FLASH_DURATION = 200; // ms
export const SUPERNOVA_DESTABILIZE_MS = 1500; // warning window between destabilize and detonation

// --- Circle (BlackHole supernova ejecta) ---
export const CIRCLE_EJECT_SPEED_MIN = 0.35;       // px/ms min ejection speed
export const CIRCLE_EJECT_SPEED_MAX = 0.85;       // px/ms max ejection speed
export const CIRCLE_EJECT_DECAY = 0.0022;          // fraction lost per ms (~80% gone in 730ms)
export const CIRCLE_FLOCK_PULL = 0.0008;           // elastic spring: speed px/ms = pull * distPx
export const CIRCLE_SUPERNOVA_SPAWN_MULTIPLIER = 2; // circles emitted = absorbedCount * this
export const BLACKHOLE_LENSING_BASE = 1.5;
export const BLACKHOLE_LENSING_PER_ABSORB = 0.35;

// --- HyperbolicDisc ---
export const HYPERBOLICDISC_WARP_RADIUS = 150; // px — bullet curving range
export const HYPERBOLICDISC_WARP_FORCE = 0.0004; // bullet bend strength

// --- Enemy collision radii ---
export const ENEMY_COLLISION_RADIUS = 28;

// --- Elite Enemies ---
export const ELITE_MODIFIERS: Record<string, { speedMult: number; scoreMult: number; hpAdd: number; colorBright: number }> = {
  rhombus:   { speedMult: 1.4, scoreMult: 3.0, hpAdd: 1, colorBright: 0.2 },
  pinwheel:  { speedMult: 1.3, scoreMult: 2.5, hpAdd: 1, colorBright: 0.15 },
  blackhole: { speedMult: 1.0, scoreMult: 1.5, hpAdd: 4, colorBright: 0.15 },
  sierpinski:{ speedMult: 1.2, scoreMult: 2.0, hpAdd: 1, colorBright: 0.2 },
};
export const ELITE_CHANCE_BY_PHASE: Record<string, number> = {
  tutorial: 0,
  rampUp: 0,
  midGame: 0.08,
  intense: 0.15,
  chaos: 0.22,
};
export const MAX_CONCURRENT_ELITES = 3;

// ============================================================
// Death by Geometry — Central Configuration
// All tunable game constants live here. Nothing is hardcoded elsewhere.
// ============================================================

// --- World ---
export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1000;

// --- Player ---
export const PLAYER_SPEED = 0.35; // px/ms
export const PLAYER_COLLISION_RADIUS = 24;
export const PLAYER_STARTING_LIVES = 5;
export const PLAYER_INVULN_DURATION = 2000; // ms of invulnerability after respawn
export const PLAYER_SHIP_SCALE = 18;
export const PLAYER_ROTATION_LERP = 0.012; // per-ms lerp factor for facing angle
export const PLAYER_SHIP_COLOR: [number, number, number] = [0.1, 1.0, 0.1];
export const PLAYER_SHIP_COLOR2: [number, number, number] = [0.05, 0.6, 0.05];
export const PLAYER_SHIP_FILL_COLOR: [number, number, number] = [0.15, 0.8, 0.15];
export const PLAYER_SHIP_FILL_ALPHA = 0.7;

// --- Crosshair (desktop: at cursor, touch: near player) ---
export const CROSSHAIR_SIZE = 14;           // distance from center to each chevron
export const CROSSHAIR_CHEVRON_SIZE = 6;    // size of each individual chevron V
export const CROSSHAIR_GAP = 4;             // inner gap (negative space diamond radius)
export const CROSSHAIR_COLOR: [number, number, number] = [0.5, 1.0, 0.5];
export const CROSSHAIR_ALPHA = 0.85;
export const CROSSHAIR_ROTATION_SPEED = 0.0008; // radians per ms (slow spin)

// --- Bullets ---
export const BULLET_SPEED = 1.0; // px/ms
export const BULLET_COLLISION_RADIUS_ENEMY = 38;
export const BULLET_SCALE = 5;
export const BULLET_COLOR: [number, number, number] = [1.0, 0.0, 0.0];
export const BULLET_COLOR2: [number, number, number] = [1.0, 0.78, 0.78];
export const BULLET_POOL_SIZE = 200;

// --- Weapon progression (score thresholds) ---
export const WEAPON_STAGES = [
  { score: 0,      shotDelay: 150, bulletCount: 1, angleOffsets: [0] },
  { score: 10000,  shotDelay: 120, bulletCount: 1, angleOffsets: [0] },
  { score: 25000,  shotDelay: 120, bulletCount: 2, angleOffsets: [-3, 3] },
  { score: 50000,  shotDelay: 90,  bulletCount: 2, angleOffsets: [-3, 3] },
  { score: 150000, shotDelay: 90,  bulletCount: 3, angleOffsets: [-3, 0, 3] },
];

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
export const BULLET_GRAVITY_STRENGTH = 0.15; // bullet bending near BlackHoles (much weaker than enemy pull)
export const BLACKHOLE_LENSING_BASE = 1.5;
export const BLACKHOLE_LENSING_PER_ABSORB = 0.35;

// --- HyperbolicDisc ---
export const HYPERBOLICDISC_WARP_RADIUS = 150; // px — bullet curving range
export const HYPERBOLICDISC_WARP_FORCE = 0.0004; // bullet bend strength

// --- Enemy collision radii ---
export const ENEMY_COLLISION_RADIUS = 28;
// --- Explosion particles ---
export const EXPLOSION_PARTICLE_COUNT_SMALL = 50;
export const EXPLOSION_PARTICLE_COUNT_LARGE = 180;
export const EXPLOSION_PARTICLE_COUNT_DEATH = 350;
export const EXPLOSION_DURATION_DEFAULT = 1.2; // seconds
export const EXPLOSION_DURATION_LARGE = 2.5;
export const EXPLOSION_DURATION_DEATH = 5.0;
export const EXPLOSION_POOL_SIZE = 60;

// --- Spawner / difficulty ---
// Phase boundaries in seconds
export const DIFFICULTY_PHASES = {
  tutorial:  { start: 0,   end: 30 },
  rampUp:    { start: 30,  end: 120 },
  midGame:   { start: 120, end: 240 },
  intense:   { start: 240, end: 400 },
  chaos:     { start: 400, end: Infinity },
};

export const SPAWN_DELAY_BETWEEN = 35; // ms between each enemy in a cluster (~1s for 30 enemies)
export const SPAWN_DURATION_DEFAULT = 1.5;   // seconds (was 0.3)
export const SPAWN_DURATION_CHILD = 0.5;     // for Shard, MiniMandel, Circle
export const SPAWN_DURATION_AMBUSH = 2.0;    // ambush spawns get extra warning time
export const MIN_SPAWN_DISTANCE = 200;       // px — enemies closer than this get pushed to edge
export const ENEMY_SEPARATION_BUFFER = 2;    // px extra clearance beyond combined collision radii (per-frame push)

// --- Mouse aim (desktop) ---

// --- Camera ---
export const CAMERA_LERP_SPEED = 0.08;
export const SCREEN_SHAKE_SMALL = 5;
export const SCREEN_SHAKE_LARGE = 10;
export const SCREEN_SHAKE_DEATH = 20;

// --- HUD ---
export const HUD_FONT = '24px monospace';
export const HUD_COLOR = '#20ff20';

// --- Offscreen indicator ---
export const OFFSCREEN_INDICATOR_RANGE = 800;

// --- Bloom ---
export const BLOOM_THRESHOLD = 0.06;
export const BLOOM_INTENSITY = 2.2;
export const BLOOM_BLUR_PASSES = 6;
export const BLOOM_BLUR_RADIUS = 2.5;

// --- Spring-mass grid ---
export const GRID_SPACING = 40;
export const GRID_SPRING_STIFFNESS = 800;
export const GRID_SPRING_DAMPING = 8;
export const GRID_ANCHOR_STIFFNESS = 15;
export const GRID_MAX_DISPLACEMENT = 160;
export const GRID_SUBSTEPS = 3;
export const GRID_MOBILE_SUBSTEPS = 2;
export const GRID_COLOR_BASE: [number, number, number] = [0.38, 0.14, 0.72];
export const GRID_COLOR_STRETCH: [number, number, number] = [0.0, 0.8, 1.0];
export const GRID_COLOR_COMPRESS: [number, number, number] = [1.0, 0.2, 0.8];

// --- Trails ---
export const TRAIL_LENGTH_ENEMY = 18;
export const TRAIL_LENGTH_BULLET = 10;

// --- Mobile ---
export const MOBILE_BLOOM_SCALE = 0.25; // bloom FBO at quarter-res on mobile
export const MOBILE_MAX_ENEMIES = 100;
export const MOBILE_MAX_PARTICLES = 30;
export const MOBILE_TRAIL_LENGTH_ENEMY = 8;
export const MOBILE_TRAIL_LENGTH_BULLET = 5;

// --- Virtual Joystick ---
export const JOYSTICK_MAX_RADIUS = 60; // max knob displacement from center
export const JOYSTICK_DEAD_ZONE = 0.15; // fraction of radius before registering input
export const JOYSTICK_BASE_RADIUS = 60; // visual radius of outer circle
export const JOYSTICK_KNOB_RADIUS = 22; // visual radius of inner knob
export const JOYSTICK_OPACITY = 0.3;
export const JOYSTICK_ACTIVE_OPACITY = 0.55;

// --- Arena border ---
export const ARENA_BORDER_COLOR: [number, number, number] = [0.0, 0.6, 1.0]; // Geometry Wars-style blue
export const ARENA_BORDER_CORNER_COLOR: [number, number, number] = [0.0, 1.0, 1.0]; // brighter corners
export const ARENA_BORDER_ALPHA = 0.9;

// --- Death slowmo ---
export const DEATH_SLOWMO_DURATION = 4800; // ms of real time
export const DEATH_SLOWMO_TIME_SCALE = 0.12; // how slow game runs during slowmo
export const DEATH_SLOWMO_SHOCKWAVE_SPEED = 0.8; // px/ms expansion speed of kill shockwave

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
export const HITSTOP_ELITE = 65;   // ms — elite kills

// --- Hitstop (combat freeze on major kills) ---
export const HITSTOP_SIERPINSKI = 50;   // ms
export const HITSTOP_BLACKHOLE = 75;    // ms
export const HITSTOP_MULTI = 35;        // ms — bonus for 3+ kills in same frame

// --- Kill Signature Effects ---
export const KILL_SIG_DURATION = 0.4;   // seconds
export const KILL_SIG_RAY_COUNT = 6;
export const KILL_SIG_RAY_LENGTH = 80;

// --- Phase Transition ---
export const PHASE_BANNER_DURATION = 2500; // ms
export const PHASE_BORDER_PULSE_DURATION = 1500; // ms

export const PHASE_DISPLAY_NAMES: Record<string, string> = {
  rampUp: 'STAGE 2',
  midGame: 'STAGE 3',
  intense: 'DANGER',
  chaos: 'CHAOS',
};

// --- Spawn Telegraphs ---
export const TELEGRAPH_DURATION = 1200;  // ms
export const TELEGRAPH_COLOR: [number, number, number] = [1.0, 0.3, 0.1];

// --- Heat System ---
export const HEAT_DECAY_RATE = 0.04;             // per second during calm (no kills)
export const HEAT_KILL_BASE = 0.02;              // per regular kill
export const HEAT_KILL_ELITE = 0.08;             // per elite kill
export const HEAT_KILL_BLACKHOLE = 0.12;         // per blackhole kill
export const HEAT_DENSE_COMBAT_BONUS = 0.01;     // per kill when 3+ kills same frame
export const HEAT_PHASE_BUMP = 0.15;             // on phase transition
export const HEAT_SURVIVAL_RATE = 0.003;         // per second in intense+ phases
export const HEAT_BORDER_BRIGHTNESS_MAX = 0.5;   // extra border brightness at max heat
export const HEAT_BLOOM_BOOST_MAX = 0.5;         // extra bloom intensity at max heat
export const HEAT_GRID_TURBULENCE_MAX = 60;      // max random grid impulse from heat

// --- Recovery Window ---
export const RECOVERY_DURATION = 3500;           // ms
export const RECOVERY_FIRE_RATE_MULT = 1.8;      // fire rate multiplier during recovery
export const RECOVERY_SHIELD_COLOR: [number, number, number] = [0.3, 0.85, 1.0];
export const RECOVERY_SHIELD_RADIUS = 32;        // px radius of shield ring

// --- Sierpinski Boss (3-tier fractal breakup: 1 → 3 → 9) ---
export const SIERPINSKI_TIER_HP = [12, 4, 1];           // tier 0 (boss), 1 (medium), 2 (small)
export const SIERPINSKI_TIER_RADIUS = [80, 45, 25];     // collision radius per tier
export const SIERPINSKI_TIER_SPEED = [0.08, 0.12, 0.18]; // px/ms per tier (smaller = faster)
export const SIERPINSKI_TIER_SCORE = [5000, 1500, 400];  // score per tier
export const SIERPINSKI_TIER_DEPTH = [3, 2, 1];          // fractal render depth per tier
export const SIERPINSKI_BOSS_SPAWN_TIME = 120;    // seconds — triggers at midGame start
export const SIERPINSKI_BOSS_WARNING_DURATION = 2500; // ms warning before spawn
export const SIERPINSKI_BOSS_RESPAWN_DELAY = 5000; // ms — re-trigger after player death
export const SIERPINSKI_BOSS_DEFEATED_BANNER_DURATION = 2500; // ms
export const SIERPINSKI_BOSS_SPAWN_SUPPRESS_MULT = 2.5; // spawn rate multiplier during fight

// --- Miniboss (Mandelbrot) ---
export const MINIBOSS_HP = 20;
export const MINIBOSS_SCORE = 10000;
export const MINIBOSS_COLLISION_RADIUS = 55;
export const MINIBOSS_SPAWN_TIME = 240;       // seconds — triggers at intense phase start
export const MINIBOSS_WARNING_DURATION = 3000; // ms warning before spawn
export const MINIBOSS_STAGE_THRESHOLDS = [14, 7]; // HP at/below which stage 2 and 3 begin
export const MINIBOSS_HITSTOP_STAGE = 100;    // ms — stage break hitstop
export const MINIBOSS_HITSTOP_DEATH = 150;    // ms — death hitstop
export const MINIBOSS_SPAWN_INTERVAL = [3.5, 2.0, 1.2]; // minion interval per stage (seconds)
export const MINIBOSS_MAX_MINIONS = [4, 6, 8]; // max active minions per stage
export const MINIBOSS_SPEED = [0.02, 0.04, 0.06]; // movement speed per stage
export const MINIBOSS_BUD_REGROW_TIME = 2.0;  // seconds to regrow a spent bud
export const MINIBOSS_RESPAWN_DELAY = 5000;   // ms — re-trigger after player death during fight
export const MINIBOSS_DEFEATED_BANNER_DURATION = 3000; // ms
export const MINIBOSS_SPAWN_SUPPRESS_MULT = 4.0; // spawn rate multiplier during fight (higher = slower)
export const MINIBOSS_HEAT_ON_DEATH = 1.0;    // heat set to max on kill

// --- Formation Group Spawn Sound ---
export const FORMATION_SOUND_MIN_COUNT = 6;
export const FORMATION_LEAKTHROUGH_COUNT = 2;
export const FORMATION_LEAKTHROUGH_VOLUME = 0.15;

// --- Audio ---
export const SFX_NAMES = [
  'start', 'die', 'die1', 'crash', 'rhombus',
  'triangle2', 'octagon', 'pinwheel', 'deathstar', 'deathstar2',
] as const;
export type SFXName = typeof SFX_NAMES[number];
// Generated SFX (MP3 files in sounds/generated/)
export const GENERATED_SFX: Record<string, string> = {
  gameover: './sounds/generated/gameover.mp3',
  'medal-reveal': './sounds/generated/medal-reveal.mp3',
};
export const MASTER_VOLUME = 0.5;
export const SFX_VOLUME = 0.6;
export const MUSIC_VOLUME = 0.35;

// --- Run Stats & Medals ---
export interface MedalDef {
  id: string;
  name: string;
  description: string;
  color: [number, number, number]; // RGB 0-1 for HUD rendering
}
export const MEDALS: MedalDef[] = [
  { id: 'untouchable', name: 'UNTOUCHABLE', description: 'No deaths', color: [0.3, 1.0, 1.0] },
  { id: 'chaos_walker', name: 'CHAOS WALKER', description: 'Reached CHAOS phase', color: [1.0, 0.3, 0.1] },
  { id: 'survivor', name: 'SURVIVOR', description: 'Reached DANGER phase', color: [1.0, 0.6, 0.1] },
  { id: 'boss_slayer', name: 'BOSS SLAYER', description: 'Defeated Mandelbrot', color: [1.0, 0.2, 0.2] },
  { id: 'elite_hunter', name: 'ELITE HUNTER', description: 'Killed 5+ elites', color: [1.0, 0.85, 0.2] },
  { id: 'gravity_master', name: 'GRAVITY MASTER', description: 'Killed 3+ black holes', color: [0.4, 0.6, 1.0] },
  { id: 'inferno', name: 'INFERNO', description: 'Peak heat above 85%', color: [1.0, 0.5, 0.0] },
  { id: 'comeback_kid', name: 'COMEBACK KID', description: 'Used 2+ recovery windows', color: [0.3, 0.9, 0.9] },
  { id: 'centurion', name: 'CENTURION', description: '100+ kills', color: [0.6, 1.0, 0.3] },
  { id: 'thousand', name: 'THOUSAND', description: '1000+ kills', color: [1.0, 1.0, 0.5] },
];

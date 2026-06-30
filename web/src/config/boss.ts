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

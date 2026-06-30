// --- Hitstop (combat freeze on major kills) ---
export const HITSTOP_ELITE = 65;   // ms — elite kills
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

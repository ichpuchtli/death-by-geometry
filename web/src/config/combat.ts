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

// --- Boss Damage Feedback ---
// Shared, data-driven feedback for any multi-hit boss (Sierpinski tiers 0/1, Mandelbrot,
// and future bosses via `Enemy.bossFeedback = true`). Non-killing hits get a "subtle bite"
// (contact spark + tiny grid dimple + a soft, pitch-rising tick); crossing a damage
// milestone gets a heavier "chunk" (bigger flash + shake + hitstop + deeper sound).
export const BOSS_HIT_SPARK_COUNT = 5;              // contact-spark motes per non-killing hit
export const BOSS_HIT_GRID_IMPULSE = 130;           // grid dimple strength per hit
export const BOSS_HIT_GRID_RADIUS = 90;             // grid dimple radius per hit
export const BOSS_HIT_SOUND_COOLDOWN_MS = 45;       // min gap between per-hit ticks (rate-limit spam)
// BlackHole per-bullet-hit sound (deep thud — the hole is not a `bossFeedback` unit, so it
// has its own tick): same rate-limit treatment as the boss tick so rapid fire can't stack it.
export const BH_HIT_SOUND_COOLDOWN_MS = 45;
// Damage fractions (0 = pristine → 1 = dead) at which a milestone "chunk" fires.
export const BOSS_MILESTONE_FRACTIONS = [0.25, 0.5, 0.75];
export const BOSS_MILESTONE_SHAKE = 6;              // screen shake on a damage milestone
export const BOSS_MILESTONE_HITSTOP = 30;           // ms hitstop on a damage milestone
export const BOSS_MILESTONE_SPARK_COUNT = 16;       // spark motes on a milestone chunk
export const BOSS_MILESTONE_GRID_IMPULSE = 380;     // grid punch on a milestone chunk

// --- Recovery Window ---
export const RECOVERY_DURATION = 3500;           // ms
export const RECOVERY_FIRE_RATE_MULT = 1.8;      // fire rate multiplier during recovery
export const RECOVERY_SHIELD_COLOR: [number, number, number] = [0.3, 0.85, 1.0];
export const RECOVERY_SHIELD_RADIUS = 32;        // px radius of shield ring

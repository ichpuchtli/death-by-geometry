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

// --- AI Wingman (co-op ally driven by the trained policy — cyan, to contrast the green player) ---
export const WINGMAN_SHIP_COLOR: [number, number, number] = [0.25, 0.9, 1.0];
export const WINGMAN_SHIP_COLOR2: [number, number, number] = [0.1, 0.5, 0.65];
export const WINGMAN_SHIP_FILL_COLOR: [number, number, number] = [0.2, 0.7, 0.95];
export const WINGMAN_SHIP_FILL_ALPHA = 0.55;
export const WINGMAN_SPAWN_OFFSET = 90; // px to the side of the player when it (re)spawns

// --- Weapon recoil / muzzle feedback (a subtle "kick" on the player only) ---
// The ship nudges backward along the aim vector and springs back, with a small muzzle
// flash at the barrel. Kept gentle — no camera shake — so rapid fire doesn't feel jarring.
// Both scale slightly with the number of pellets so a 6-pellet Hex Storm reads a touch
// heavier than the 2-pellet Twin.
export const PLAYER_RECOIL_BASE = 2.5;        // px kick for a 2-pellet shot
export const PLAYER_RECOIL_PER_PELLET = 0.6;  // extra px per pellet beyond 2
export const PLAYER_RECOIL_DECAY = 90;        // ms to spring back to rest
export const PLAYER_MUZZLE_FLASH_LENGTH = 12; // px length of the flash burst
export const PLAYER_MUZZLE_FLASH_PER_PELLET = 1.5; // extra px per pellet beyond 2

// --- Crosshair (desktop: at cursor, touch: near player) ---
export const CROSSHAIR_SIZE = 14;           // distance from center to each chevron
export const CROSSHAIR_CHEVRON_SIZE = 6;    // size of each individual chevron V
export const CROSSHAIR_GAP = 4;             // inner gap (negative space diamond radius)
export const CROSSHAIR_COLOR: [number, number, number] = [0.5, 1.0, 0.5];
export const CROSSHAIR_ALPHA = 0.85;
export const CROSSHAIR_ROTATION_SPEED = 0.0008; // radians per ms (slow spin)

// --- Weapon progression (score thresholds) ---
// Shotgun-style: slow, deliberate cadence (shotDelay ~280–320ms, vs the old 90–150ms
// stream) so you can't sweep a continuous stream across the screen — every trigger pull
// is a committed blast that must be aimed. Progression ramps the number of parallel
// pellets (2→6) and widens the cone rather than speeding up fire. `bulletCount` is
// descriptive; the actual pellets fired are `angleOffsets` (degrees).
export const WEAPON_STAGES = [
  { score: 0,      shotDelay: 320, bulletCount: 2, angleOffsets: [-4, 4] },
  { score: 10000,  shotDelay: 310, bulletCount: 3, angleOffsets: [-8, 0, 8] },
  { score: 25000,  shotDelay: 300, bulletCount: 4, angleOffsets: [-11, -4, 4, 11] },
  { score: 50000,  shotDelay: 290, bulletCount: 5, angleOffsets: [-14, -7, 0, 7, 14] },
  { score: 150000, shotDelay: 280, bulletCount: 6, angleOffsets: [-16, -9, -3, 3, 9, 16] },
];

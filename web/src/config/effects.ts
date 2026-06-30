// --- Explosion particles ---
export const EXPLOSION_PARTICLE_COUNT_SMALL = 50;
export const EXPLOSION_PARTICLE_COUNT_LARGE = 180;
export const EXPLOSION_PARTICLE_COUNT_DEATH = 350;
export const EXPLOSION_DURATION_DEFAULT = 1.2; // seconds
export const EXPLOSION_DURATION_LARGE = 2.5;
export const EXPLOSION_DURATION_DEATH = 5.0;
export const EXPLOSION_POOL_SIZE = 60;

// --- Camera ---
export const CAMERA_LERP_SPEED = 0.08;
export const SCREEN_SHAKE_SMALL = 5;
export const SCREEN_SHAKE_LARGE = 10;
export const SCREEN_SHAKE_DEATH = 20;

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
export const MOBILE_TRAIL_LENGTH_ENEMY = 8;
export const MOBILE_TRAIL_LENGTH_BULLET = 5;

// --- Death slowmo ---
export const DEATH_SLOWMO_DURATION = 4800; // ms of real time
export const DEATH_SLOWMO_TIME_SCALE = 0.12; // how slow game runs during slowmo
export const DEATH_SLOWMO_SHOCKWAVE_SPEED = 0.8; // px/ms expansion speed of kill shockwave

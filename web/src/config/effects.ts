// --- Explosion particles ---
export const EXPLOSION_PARTICLE_COUNT_SMALL = 50;
export const EXPLOSION_PARTICLE_COUNT_LARGE = 180;
export const EXPLOSION_PARTICLE_COUNT_DEATH = 350;
export const EXPLOSION_DURATION_DEFAULT = 1.2; // seconds
export const EXPLOSION_DURATION_LARGE = 2.5;
export const EXPLOSION_DURATION_DEATH = 5.0;
export const EXPLOSION_POOL_SIZE = 60;

// --- Directional death shatter (bullet momentum transfer) ---
// When a bullet kills a unit, fragments fan FORWARD along the bullet's travel direction —
// nothing flies back toward the shooter. Cone is the half-angle of the fan; side damping
// is the fragment speed at the cone edge relative to dead-ahead.
export const DEATH_FRAGMENT_CONE = 1.35;         // rad (±77°) — back hemisphere stays empty
export const DEATH_FRAGMENT_SIDE_DAMPING = 0.45; // edge fragments move at 45% of forward speed
export const DEATH_FRAGMENT_FORWARD_BOOST = 1.4; // overall speed-up vs radial (momentum carried in)

// --- Ambient particle field (cosmic dust) ---
// A field of additive motes drifting through world space, pulled + swirled around
// attractors (BlackHoles) into glowing accretion disks. Tunables are live-editable
// in the Particle Lab (?particles=1); these are the defaults / starting points.
export const PARTICLE_FIELD_DENSITY = 520;       // ambient motes across the view
export const PARTICLE_FIELD_DRAG = 0.985;        // per-frame velocity retention (frame-normalized)
export const PARTICLE_FIELD_MAX_SPEED = 9.5;     // px/frame speed cap
export const PARTICLE_FIELD_SWIRL = 0.55;        // tangential force as a fraction of radial pull (the "orbit" knob)
export const PARTICLE_FIELD_STREAK = 2.4;        // velocity-stretch multiplier for the streak tail
export const PARTICLE_FIELD_SOFTENING = 850;     // distance² softening so the core pull stays finite
export const PARTICLE_FIELD_MAX_TRANSIENT = 420; // cap on live burst motes (thruster wake + impact sparks)

// --- Geometry shatter (solid-object death) ---
// When a unit is destroyed by a bullet/contact (not absorbed, not a boss), it breaks
// along its OWN edges: each edge becomes a rigid line fragment that tumbles outward
// carrying the impact momentum, instead of dissolving into a generic particle cloud.
export const SHATTER_EDGE_SUBDIV = 2;        // split each shape edge into N shards (more = finer debris)
export const SHATTER_EJECT_SPEED = 0.10;     // px/ms base outward speed from the shape centroid
export const SHATTER_IMPACT_SHARE = 0.55;    // how much of the impact direction each shard inherits
export const SHATTER_SPIN = 0.010;           // rad/ms max tumble rate
export const SHATTER_DRAG = 0.94;            // per-frame velocity retention (frame-normalized)
export const SHATTER_LIFE = 0.45;            // seconds a shard lives before it fades out
export const SHATTER_POOL_SIZE = 900;        // shard pool cap (edges * subdiv * concurrent deaths)

// --- Tidal death warp (spaghettification) ---
// A unit caught in a BlackHole's core has its geometry stretched + twisted toward the
// hole in its final moments before it's swallowed. Driven per-vertex by Renderer.setWarp.
export const DEATH_WARP_STRETCH = 0.55;      // radial inward tidal displacement at full intensity
export const DEATH_WARP_TWIST = 2.2;         // radians of frame-drag swirl at full intensity, at the core

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

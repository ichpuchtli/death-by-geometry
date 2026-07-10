import type { SpringMassGrid } from '../renderer/grid';
import type { Camera } from '../core/camera';
import type { AudioManager } from '../core/audio';
import type { ExplosionPool } from '../entities/explosion';
import type { ParticleField } from '../renderer/particle-field';
import type { DebrisField } from '../renderer/debris-field';
import type { HUD } from '../ui/hud';

/**
 * No-op stand-ins for the renderer/audio/camera/HUD dependencies the gameplay systems
 * expect. In the headless training sim these are all purely visual/audible side effects
 * with no bearing on dynamics, so we hand the systems a stub whose every method does
 * nothing. Because the systems import these classes with `import type`, the real WebGL
 * modules are never loaded in Node.
 */
function noopStub<T>(): T {
  return new Proxy(
    {},
    { get: () => () => undefined },
  ) as unknown as T;
}

export const stubGrid = (): SpringMassGrid => noopStub<SpringMassGrid>();
export const stubCamera = (): Camera => noopStub<Camera>();
export const stubAudio = (): AudioManager => noopStub<AudioManager>();
export const stubExplosions = (): ExplosionPool => noopStub<ExplosionPool>();
export const stubField = (): ParticleField => noopStub<ParticleField>();
export const stubDebris = (): DebrisField => noopStub<DebrisField>();
export const stubHud = (): HUD => noopStub<HUD>();

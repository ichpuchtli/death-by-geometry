// ============================================================
// Death by Geometry — Central Configuration
// All tunable game constants live here. Nothing is hardcoded elsewhere.
//
// Constants are organized into domain files under `config/` and re-exported
// from this barrel, so existing `import { X } from './config'` keeps working.
// When adding a constant, put it in the matching domain file:
//   world · player · bullet · enemy · spawner · effects · ui · combat · boss · audio · medals
// ============================================================

export * from './config/world';
export * from './config/player';
export * from './config/bullet';
export * from './config/enemy';
export * from './config/spawner';
export * from './config/effects';
export * from './config/ui';
export * from './config/combat';
export * from './config/boss';
export * from './config/audio';
export * from './config/medals';
export * from './config/time-dilation';

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
  // Black hole sounds (ElevenLabs v3 picks from sounds/generated/blackhole-hit/)
  'blackhole-hit': './sounds/generated/blackhole-hit.mp3',
  'blackhole-absorb': './sounds/generated/blackhole-absorb.mp3',
  'blackhole-death': './sounds/generated/blackhole-death.mp3',
  // Black hole spawn (ElevenLabs pick from sounds/generated/blackhole-spawn/)
  'blackhole-spawn': './sounds/generated/blackhole-spawn.mp3',
};
export const MASTER_VOLUME = 0.5;
export const SFX_VOLUME = 0.6;
export const MUSIC_VOLUME = 0.35;
// Detonation sound used by the real supernova path (A/B tested in the Threat Lab, user picked 'subdrop')
export const SUPERNOVA_SOUND_VARIANT: 'classic' | 'subdrop' | 'doom' | 'quake' = 'subdrop';

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

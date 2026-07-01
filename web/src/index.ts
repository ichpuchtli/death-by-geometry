import { Game } from './game';
import { loadSettings } from './settings';
import { initSettingsPanel } from './ui/settings-panel';

loadSettings();
const desktopSettingsMount = document.getElementById('desktop-settings');
initSettingsPanel(desktopSettingsMount);

const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
const hudCanvas = document.getElementById('hud') as HTMLCanvasElement;

const game = new Game(gameCanvas, hudCanvas);
// Debug/test hook: lets Playwright flows inspect live game state (score, lives, state).
(window as unknown as { game: Game }).game = game;

let lastTime = performance.now();
let paused = false;
let orientationPaused = false;

function checkOrientation(): void {
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isMobile) return;

  const isPortrait = window.innerHeight > window.innerWidth;
  const rotatePrompt = document.getElementById('rotate-prompt');

  if (isPortrait) {
    if (!orientationPaused) {
      orientationPaused = true;
      game.onOrientationPause();
    }
    if (rotatePrompt) rotatePrompt.style.display = 'flex';
  } else {
    if (orientationPaused) {
      orientationPaused = false;
      game.onOrientationResume();
    }
    if (rotatePrompt) rotatePrompt.style.display = 'none';
  }
}

function loop(time: number): void {
  if (!paused && !orientationPaused) {
    const dt = Math.min(time - lastTime, 50);
    lastTime = time;
    game.update(dt);
    game.render();
  } else {
    lastTime = time;
    // Still render the frozen scene when orientation-paused
    if (orientationPaused) {
      game.render();
    }
  }
  requestAnimationFrame(loop);
}

// Pause when tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    paused = true;
    game.onPause();
  } else {
    paused = false;
    lastTime = performance.now();
    game.onResume();
  }
});

// Orientation change detection
window.addEventListener('resize', () => checkOrientation());
window.addEventListener('orientationchange', () => {
  setTimeout(() => checkOrientation(), 100);
});
checkOrientation();

requestAnimationFrame(loop);

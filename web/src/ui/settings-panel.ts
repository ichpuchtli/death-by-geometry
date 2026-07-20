import { gameSettings, saveSettings, resetSettings, DEFAULTS, type GameSettings } from '../settings';

const PHASES = ['tutorial', 'rampUp', 'midGame', 'intense', 'chaos'];
const PHASE_LABELS: Record<string, string> = {
  tutorial: 'Tutorial',
  rampUp: 'Ramp Up',
  midGame: 'Mid Game',
  intense: 'Intense',
  chaos: 'Chaos',
};

interface SliderDef {
  key: keyof GameSettings;
  label: string;
  desc: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}

const SLIDERS: SliderDef[] = [
  { key: 'spawnRateMultiplier', label: 'Spawn Rate', desc: 'Scales spawn intervals. Lower = more enemies', min: 0.5, max: 2.0, step: 0.1, format: v => `${v.toFixed(1)}x` },
  { key: 'startingLives', label: 'Starting Lives', desc: 'Number of lives at game start', min: 1, max: 10, step: 1, format: v => `${v}` },
  { key: 'playerSpeedMultiplier', label: 'Player Speed', desc: 'Multiplier on player movement speed', min: 0.5, max: 2.0, step: 0.1, format: v => `${v.toFixed(1)}x` },
  { key: 'fireRateMultiplier', label: 'Fire Rate', desc: 'Multiplier on shooting speed', min: 0.5, max: 3.0, step: 0.1, format: v => `${v.toFixed(1)}x` },
  { key: 'enemySpeedMultiplier', label: 'Enemy Speed', desc: 'Multiplier on all enemy movement', min: 0.5, max: 2.0, step: 0.1, format: v => `${v.toFixed(1)}x` },
  { key: 'maxEnemies', label: 'Max Enemies', desc: 'Hard cap on simultaneous enemies', min: 20, max: 150, step: 10, format: v => `${v}` },
  { key: 'bloomIntensity', label: 'Bloom', desc: 'Glow post-processing intensity', min: 0.5, max: 4.0, step: 0.1, format: v => `${v.toFixed(1)}` },
  { key: 'trailLength', label: 'Trail Length', desc: 'Length of motion trails behind entities', min: 2, max: 30, step: 1, format: v => `${v}` },
  { key: 'gridOpacity', label: 'Grid Opacity', desc: 'Spacetime-fabric line opacity. Lower = enemies read clearer', min: 0.05, max: 1.0, step: 0.05, format: v => v.toFixed(2) },
  { key: 'zoomScale', label: 'Zoom', desc: 'Camera zoom (lower = see more arena)', min: 0.5, max: 1.5, step: 0.05, format: v => `${v.toFixed(2)}x` },
  // BlackHole gravity
  { key: 'bhAttractRadius', label: 'BH Pull Radius', desc: 'How far BlackHole gravity reaches (px)', min: 50, max: 900, step: 10, format: v => `${v}px` },
  { key: 'bhEnemyPull', label: 'BH Enemy Pull', desc: 'Pull on enemies (force = pull/dist; core zone multiplies it)', min: 1, max: 40, step: 0.5, format: v => v.toFixed(1) },
  { key: 'bhPlayerPull', label: 'BH Player Pull', desc: 'Strength of pull on the player', min: 0.0, max: 15.0, step: 0.5, format: v => v.toFixed(1) },
  { key: 'bhGridMassBase', label: 'BH Grid Depth', desc: 'Grid warping depth at 0 absorbed enemies', min: 0, max: 800, step: 10, format: v => `${v}` },
  { key: 'bhGridMassPerAbsorb', label: 'BH Grid/Absorb', desc: 'Additional grid depth per absorbed enemy', min: 0, max: 100, step: 5, format: v => `${v}` },
  { key: 'bhGridRadiusMultiplier', label: 'BH Grid Radius', desc: 'Grid warp radius as multiple of pull radius', min: 0.5, max: 5.0, step: 0.1, format: v => `${v.toFixed(1)}x` },
  { key: 'bhGridPerspectiveDepth', label: 'BH Depth Effect', desc: 'Strength of 3D spacetime depression illusion (0=flat, 1=max)', min: 0.0, max: 1.0, step: 0.05, format: v => v.toFixed(2) },
  // Grid physics
  { key: 'gridAnchorStiffness', label: 'Grid Anchor', desc: 'Spring return-to-rest strength (higher = stiffer)', min: 1, max: 100, step: 1, format: v => `${v}` },
  { key: 'gridDamping', label: 'Grid Damping', desc: 'Velocity damping (higher = less wobble)', min: 1, max: 20, step: 1, format: v => `${v}` },
  { key: 'gridMaxDisplacement', label: 'Grid Max Disp', desc: 'Maximum grid node displacement from rest (px)', min: 20, max: 200, step: 5, format: v => `${v}px` },
  // GPU Stress
  { key: 'arenaWidth', label: 'Arena Width', desc: 'World width in pixels (restart required)', min: 800, max: 6400, step: 200, format: v => `${v}px` },
  { key: 'arenaHeight', label: 'Arena Height', desc: 'World height in pixels (restart required)', min: 500, max: 4000, step: 200, format: v => `${v}px` },
  { key: 'gridSpacing', label: 'Grid Spacing', desc: 'Distance between grid nodes — lower = more nodes (restart required)', min: 10, max: 80, step: 5, format: v => `${v}px` },
  { key: 'gridSubsteps', label: 'Grid Substeps', desc: 'Physics substeps per frame (higher = more accurate + expensive)', min: 1, max: 8, step: 1, format: v => `${v}` },
  { key: 'gridSpringStiffness', label: 'Grid Stiffness', desc: 'Neighbor spring strength (higher = tighter grid)', min: 100, max: 3000, step: 100, format: v => `${v}` },
  { key: 'bloomThreshold', label: 'Bloom Threshold', desc: 'Brightness cutoff for bloom extract', min: 0.01, max: 0.5, step: 0.01, format: v => v.toFixed(2) },
  { key: 'bloomBlurPasses', label: 'Bloom Passes', desc: 'Gaussian blur iterations (higher = softer glow + more GPU)', min: 1, max: 12, step: 1, format: v => `${v}` },
  { key: 'bloomBlurRadius', label: 'Bloom Radius', desc: 'Blur kernel size (higher = wider glow)', min: 0.5, max: 6.0, step: 0.5, format: v => v.toFixed(1) },
  { key: 'resolutionScale', label: 'Resolution Scale', desc: 'Multiplier on device pixel ratio (2.0 = supersampling)', min: 0.25, max: 2.0, step: 0.25, format: v => `${v.toFixed(2)}x` },
];

interface CheckboxDef {
  key: keyof GameSettings;
  label: string;
  desc: string;
}

const CHECKBOXES: CheckboxDef[] = [
  { key: 'vulnerableDuringSpawn', label: 'Kill During Spawn', desc: 'Enemies can be destroyed during spawn-in animation' },
  { key: 'aiWingman', label: 'AI Wingman', desc: 'An AI ally (cyan ship) fights beside you. Toggle any time.' },
];

// Track all panel instances so Reset Defaults can sync them all
const panelInstances: { panel: HTMLDivElement; valueDisplays: Record<string, HTMLSpanElement> }[] = [];

function buildSettingsPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.className = 'settings-panel';
  panel.innerHTML = '<h2>Settings</h2>';

  const valueDisplays: Record<string, HTMLSpanElement> = {};

  // Phase select
  {
    const row = document.createElement('div');
    row.className = 'sp-row';
    const header = document.createElement('div');
    header.className = 'sp-header';
    header.innerHTML = '<span class="sp-label">Starting Phase</span>';
    row.appendChild(header);
    const desc = document.createElement('div');
    desc.className = 'sp-desc';
    desc.textContent = 'Skip to a later difficulty phase';
    row.appendChild(desc);

    const sel = document.createElement('select');
    for (const p of PHASES) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = PHASE_LABELS[p];
      if (p === gameSettings.startingPhase) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      gameSettings.startingPhase = sel.value;
      saveSettings();
      syncAllPanels();
    });
    row.appendChild(sel);
    panel.appendChild(row);
  }

  // Checkboxes (boolean toggles)
  for (const def of CHECKBOXES) {
    const row = document.createElement('div');
    row.className = 'sp-row sp-checkbox-row';
    const label = document.createElement('label');
    label.className = 'sp-checkbox-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.key = def.key;
    cb.checked = gameSettings[def.key] as boolean;
    cb.addEventListener('change', () => {
      (gameSettings as unknown as Record<string, unknown>)[def.key] = cb.checked;
      saveSettings();
      syncAllPanels();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + def.label));
    row.appendChild(label);
    const desc = document.createElement('div');
    desc.className = 'sp-desc';
    desc.textContent = def.desc;
    row.appendChild(desc);
    panel.appendChild(row);
  }

  // Sliders
  for (const def of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'sp-row';

    const header = document.createElement('div');
    header.className = 'sp-header';
    const label = document.createElement('span');
    label.className = 'sp-label';
    label.textContent = def.label;
    const val = document.createElement('span');
    val.className = 'sp-value';
    const fmt = def.format ?? (v => `${v}`);
    val.textContent = fmt(gameSettings[def.key] as number);
    valueDisplays[def.key] = val;
    header.appendChild(label);
    header.appendChild(val);
    row.appendChild(header);

    const descEl = document.createElement('div');
    descEl.className = 'sp-desc';
    descEl.textContent = def.desc;
    row.appendChild(descEl);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = `${def.min}`;
    input.max = `${def.max}`;
    input.step = `${def.step}`;
    input.value = `${gameSettings[def.key]}`;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      (gameSettings as unknown as Record<string, unknown>)[def.key] = v;
      val.textContent = fmt(v);
      saveSettings();
      syncAllPanels();
      if (def.key === 'zoomScale') window.dispatchEvent(new Event('resize'));
    });
    row.appendChild(input);
    panel.appendChild(row);
  }

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.className = 'sp-reset';
  resetBtn.textContent = 'Reset Defaults';
  resetBtn.addEventListener('click', () => {
    resetSettings();
    syncAllPanels();
  });
  panel.appendChild(resetBtn);

  panelInstances.push({ panel, valueDisplays });
  return panel;
}

/** Sync all panel instances to current gameSettings values */
function syncAllPanels(): void {
  for (const inst of panelInstances) {
    // Update selects
    const selects = inst.panel.querySelectorAll('select');
    selects.forEach(sel => {
      (sel as HTMLSelectElement).value = gameSettings.startingPhase;
    });
    // Update checkboxes (keyed by data-key so each toggle syncs to its own setting)
    const checkboxes = inst.panel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      const key = (cb as HTMLInputElement).dataset.key as keyof GameSettings | undefined;
      if (key) (cb as HTMLInputElement).checked = gameSettings[key] as boolean;
    });
    // Update sliders + value displays
    const inputs = inst.panel.querySelectorAll('input[type="range"]');
    for (let i = 0; i < SLIDERS.length; i++) {
      const def = SLIDERS[i];
      if (inputs[i]) {
        (inputs[i] as HTMLInputElement).value = `${gameSettings[def.key]}`;
      }
      const fmt = def.format ?? (v => `${v}`);
      if (inst.valueDisplays[def.key]) {
        inst.valueDisplays[def.key].textContent = fmt(gameSettings[def.key] as number);
      }
    }
  }
}

let styleAppended = false;
let desktopContainer: HTMLElement | null = null;

export function initSettingsPanel(desktopMount?: HTMLElement | null): void {
  if (!styleAppended) {
    const style = document.createElement('style');
    style.textContent = `
      .settings-panel {
        width: 100%;
        max-width: 320px;
        font-family: monospace;
        color: #38f2c8;
        font-size: 13px;
        padding: 0 16px;
      }
      .settings-panel h2 {
        font-size: 14px;
        margin: 0 0 12px;
        padding-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 2px;
        opacity: 0.85;
        border-bottom: 1px solid rgba(120,200,190,0.28);
      }
      .sp-row {
        margin-bottom: 8px;
      }
      .sp-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 2px;
      }
      .sp-label { opacity: 0.8; }
      .sp-desc { font-size: 10px; opacity: 0.45; margin-bottom: 2px; }
      .sp-value { color: #7dffea; font-weight: bold; }
      .sp-checkbox-row { margin-bottom: 12px; }
      .sp-checkbox-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        opacity: 0.9;
      }
      .sp-checkbox-label input[type="checkbox"] {
        accent-color: #38f2c8;
        width: 14px;
        height: 14px;
        cursor: pointer;
      }
      .sp-row input[type="range"] {
        width: 100%;
        height: 20px;
        accent-color: #38f2c8;
        background: transparent;
        cursor: pointer;
      }
      .sp-row select {
        width: 100%;
        background: rgba(6,10,14,0.8);
        color: #38f2c8;
        border: 1px solid rgba(120,200,190,0.3);
        font-family: monospace;
        font-size: 13px;
        padding: 4px;
        cursor: pointer;
      }
      .sp-reset {
        margin-top: 12px;
        background: transparent;
        color: #38f2c8;
        border: 1px solid rgba(56,242,200,0.5);
        border-radius: 6px;
        font-family: monospace;
        font-size: 12px;
        padding: 6px 16px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 1px;
        transition: background 0.12s;
      }
      .sp-reset:hover { background: rgba(56,242,200,0.12); }
      .sp-reset:active { background: rgba(56,242,200,0.2); }
    `;
    document.head.appendChild(style);
    styleAppended = true;
  }

  // Mobile mount (inside #rotate-prompt)
  const mobileMount = document.getElementById('settings-mount');
  if (mobileMount) {
    mobileMount.appendChild(buildSettingsPanel());
  }

  // Desktop mount
  if (desktopMount) {
    desktopContainer = desktopMount;
    desktopMount.appendChild(buildSettingsPanel());
  }
}

export function showDesktopSettings(): void {
  if (desktopContainer) desktopContainer.style.display = 'block';
}

export function hideDesktopSettings(): void {
  if (desktopContainer) desktopContainer.style.display = 'none';
}

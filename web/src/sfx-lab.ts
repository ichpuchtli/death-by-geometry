import { AudioManager, BlackHoleHitVariant, SupernovaSoundVariant } from './core/audio';
import { BH_HIT_SOUND_COOLDOWN_MS } from './config';

/** One ElevenLabs black-hole-hit candidate, from sfx-audition/blackhole-hit/index.json. */
interface SfxCandidate {
  id: number;
  name: string;
  file: string;
  prompt: string | null;
  duration: number | null;
  /** false until the generator has produced the mp3 and `npm run sfx:sync` has copied it. */
  available: boolean;
}

/** One Artlist-candidate category — auto-discovered files, no manifest/prompt. */
interface ArtlistCategory {
  dir: string;
  label: string;
  base: string;
  candidates: SfxCandidate[];
  ready: boolean;
  loadError: string | null;
}

const ARTLIST_CATEGORIES: { dir: string; label: string }[] = [
  { dir: 'player-hit', label: 'Player hit / damage taken (currently silent)' },
  { dir: 'player-death', label: 'Player death (replaces die/die1.wav)' },
  { dir: 'weapon-upgrade', label: 'Weapon stage upgrade (currently silent)' },
  { dir: 'legacy-kills', label: 'Legacy kill/UI replacements (rhombus/pinwheel/octagon/crash/deathstar/triangle2.wav)' },
  { dir: 'ui-click', label: 'Menu click / pause / mute toggle (currently silent)' },
  { dir: 'game-start', label: 'Game start / power-on (replaces start.wav)' },
];

const HIT_VARIANTS: BlackHoleHitVariant[] = ['thud', 'gulp', 'crack'];
const DEATH_VARIANTS: SupernovaSoundVariant[] = ['classic', 'subdrop', 'doom', 'quake'];
// Keyboard shortcuts for the 12 candidates: 1-9, 0, -, =
const CANDIDATE_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
const CANDIDATE_KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
const AUDITION_BASE = './sfx-audition/blackhole-hit';
const AUDITION_SPAWN_BASE = './sfx-audition/blackhole-spawn';
// Candidates promoted into the game (copied to web/public/sounds/generated/, see GENERATED_SFX)
const IN_GAME_BADGES: Record<string, string> = {
  'blackhole_hit_magnetic_thump_a_elevenlabs_v3.mp3': 'IN GAME — hit',
  'blackhole_hit_heartbeat_hollow_elevenlabs_v3.mp3': 'IN GAME — absorb',
  'blackhole_hit_sub_drop_thump_elevenlabs_v3.mp3': 'IN GAME — death',
  'blackhole_spawn_implosion_swell_elevenlabs_v1.mp3': 'IN GAME — spawn',
};

interface SpamState {
  enabled: boolean;
  timer: number;
  play: () => void;
}

/**
 * SFX Audition Lab (`?sfx=1`) — a DOM page (no canvas scene) for auditioning black-hole
 * sounds and picking winners. Four sections:
 *   1. Procedural hits (playable now) — the shipped `playBlackHoleHit` variants.
 *   2. ElevenLabs hit candidates — the 12-job manifest `scripts/elevenlabs-sfx-jobs-blackhole-hit.json`,
 *      served via `web/public/sfx-audition/blackhole-hit/index.json` (see
 *      `web/scripts/sync-sfx-audition.mjs`). Ungenerated entries render as
 *      "pending generation" (disabled) — never an error.
 *   3. Procedural deaths — the `playSupernovaVariant` set, for A/B contrast.
 *   4. ElevenLabs spawn candidates — the 10-job manifest
 *      `scripts/elevenlabs-sfx-jobs-blackhole-spawn.json` + the copy-only legacy
 *      `blackhole_form_elevenlabs_v1.mp3` (11 rows), served via
 *      `web/public/sfx-audition/blackhole-spawn/index.json`. Click-only (the
 *      1-9,0,-,= keys belong to the hit section).
 * Every playable row has a rapid-fire spam toggle (rate slider 6–10 hits/s) so layering
 * under sustained fire can be judged; procedural spam keeps the game's 45ms min-gap.
 * Candidates promoted into the game (IN_GAME_BADGES) get a green "IN GAME — …" tag.
 */
export class SfxLab {
  private audio: AudioManager;

  candidates: SfxCandidate[] = [];
  /** true once index.json has been fetched (or failed — check loadError). */
  ready = false;
  loadError: string | null = null;
  spawnCandidates: SfxCandidate[] = [];
  spawnReady = false;
  spawnLoadError: string | null = null;
  spawnEntriesRendered = 0;
  artlist: ArtlistCategory[] = ARTLIST_CATEGORIES.map((c) => ({
    ...c,
    base: `./sfx-audition/artlist-${c.dir}`,
    candidates: [],
    ready: false,
    loadError: null,
  }));
  volume = 0.8;
  spamRate = 8; // hits/sec for the rapid-fire toggles
  entriesRendered = 0;

  private page: HTMLDivElement;
  private spam: SpamState[] = [];
  private lastProcPlay = -1e9; // ms timestamp of the last procedural hit (game rate-limit mirror)
  private totalTime = 0;

  constructor(_canvas: HTMLCanvasElement) {
    void _canvas; // DOM-only lab — the canvas stays blank behind the page
    this.audio = new AudioManager();

    this.page = document.createElement('div');
    this.page.id = 'sfx-lab-page';
    this.page.style.cssText =
      'position:fixed;inset:0;z-index:20;overflow-y:auto;background:#05070d;' +
      'font-family:monospace;font-size:12px;color:#c9d8e8;line-height:1.6;padding:18px 22px;';
    document.body.appendChild(this.page);

    window.addEventListener('keydown', (e) => this.onKeyDown(e.code));
    // AudioContext requires a user gesture (same pattern as the other labs)
    const initAudio = (): void => { if (!this.audio.initialized) this.audio.init().catch(() => {}); };
    window.addEventListener('pointerdown', initAudio);
    window.addEventListener('keydown', initAudio);

    this.buildShell();
    this.loadCandidates();
    this.loadSpawnCandidates();
    for (const cat of this.artlist) this.loadArtlistCategory(cat);
  }

  // ============================================================
  // Data
  // ============================================================
  private async loadCandidates(): Promise<void> {
    try {
      const resp = await fetch(`${AUDITION_BASE}/index.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.candidates = (await resp.json()) as SfxCandidate[];
    } catch {
      this.loadError = 'index.json not found — run `npm run sfx:sync` (in web/) to (re)build the audition index.';
      this.candidates = [];
    }
    this.ready = true;
    this.renderCandidates();
  }

  private async loadSpawnCandidates(): Promise<void> {
    try {
      const resp = await fetch(`${AUDITION_SPAWN_BASE}/index.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      this.spawnCandidates = (await resp.json()) as SfxCandidate[];
    } catch {
      this.spawnLoadError = 'index.json not found — run `npm run sfx:sync` (in web/) to (re)build the audition index.';
      this.spawnCandidates = [];
    }
    this.spawnReady = true;
    this.renderSpawnCandidates();
  }

  private async loadArtlistCategory(cat: ArtlistCategory): Promise<void> {
    try {
      const resp = await fetch(`${cat.base}/index.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      cat.candidates = (await resp.json()) as SfxCandidate[];
    } catch {
      cat.loadError = 'index.json not found — run `npm run sfx:sync` (in web/) to build the audition index.';
      cat.candidates = [];
    }
    cat.ready = true;
    this.renderArtlistCategory(cat);
  }

  // ============================================================
  // Playback
  // ============================================================
  /** Procedural hit via the real AudioManager path (game's rate-limit mirrored). */
  playProceduralHit(variant: BlackHoleHitVariant): void {
    const now = performance.now();
    if (now - this.lastProcPlay < BH_HIT_SOUND_COOLDOWN_MS) return;
    this.lastProcPlay = now;
    this.audio.playBlackHoleHit(variant, this.volume);
  }

  playDeathVariant(variant: SupernovaSoundVariant): void {
    this.audio.playSupernovaVariant(variant, 8);
  }

  /** ElevenLabs candidate by 1-based id. No-op (never an error) while pending generation. */
  playCandidate(id: number): void {
    const c = this.candidates[id - 1];
    if (!c || !c.available) return;
    const el = new Audio(`${AUDITION_BASE}/${c.file}`);
    el.volume = this.volume;
    el.play().catch(() => {});
  }

  /** ElevenLabs spawn candidate by 1-based id. No-op (never an error) while pending generation. */
  playSpawnCandidate(id: number): void {
    const c = this.spawnCandidates[id - 1];
    if (!c || !c.available) return;
    const el = new Audio(`${AUDITION_SPAWN_BASE}/${c.file}`);
    el.volume = this.volume;
    el.play().catch(() => {});
  }

  /** Artlist candidate by category dir + 1-based id. No-op if missing (never an error). */
  playArtlistCandidate(dir: string, id: number): void {
    const cat = this.artlist.find((c) => c.dir === dir);
    const c = cat?.candidates[id - 1];
    if (!c || !c.available) return;
    const el = new Audio(`${cat!.base}/${c.file}`);
    el.volume = this.volume;
    el.play().catch(() => {});
  }

  // ============================================================
  // rAF loop hooks (spam timers only — nothing to draw)
  // ============================================================
  update(dt: number): void {
    this.totalTime += dt;
    for (const s of this.spam) {
      if (!s.enabled) continue;
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = 1000 / this.spamRate;
        s.play();
      }
    }
  }

  render(): void { /* DOM-only lab — the page is the UI */ }

  private onKeyDown(code: string): void {
    const idx = CANDIDATE_KEYS.indexOf(code);
    if (idx >= 0 && idx < this.candidates.length) this.playCandidate(idx + 1);
  }

  // ============================================================
  // DOM
  // ============================================================
  private buildShell(): void {
    this.page.innerHTML = '';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:17px;font-weight:bold;color:#ffc9a0;text-shadow:0 0 8px rgba(255,150,60,0.5);';
    title.textContent = 'SFX AUDITION LAB — black hole hit + spawn candidates';
    const sub = document.createElement('div');
    sub.style.cssText = 'color:#c88a5a;margin-bottom:10px;';
    sub.textContent =
      'Audition lab — rows tagged IN GAME are promoted into gameplay (web/public/sounds/generated/). ' +
      'Generate: npm run sfx:elevenlabs -- --manifest <manifest> (repo root) · then: npm run sfx:sync (web/). Keys 1-9,0,-,= play hit candidates 1-12; spawn rows are click-only.';
    this.page.append(title, sub);

    // Global controls: volume + spam rate
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:28px;align-items:center;margin-bottom:12px;flex-wrap:wrap;';
    controls.append(
      this.sliderRow('Volume', 0, 1, 0.05, this.volume, (v) => { this.volume = v; }),
      this.sliderRow('Spam rate (hits/s)', 6, 10, 0.5, this.spamRate, (v) => { this.spamRate = v; }),
    );
    this.page.appendChild(controls);

    // Section 1 — procedural hits
    this.page.appendChild(this.sectionTitle('1 · Black hole hit — procedural (playable now)'));
    const procRow = document.createElement('div');
    procRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;';
    for (const v of HIT_VARIANTS) {
      procRow.appendChild(this.entryRow({
        label: v,
        keyHint: null,
        available: true,
        prompt: null,
        play: () => this.playProceduralHit(v),
      }));
    }
    this.page.appendChild(procRow);

    // Section 2 — ElevenLabs candidates (filled in by loadCandidates)
    this.page.appendChild(this.sectionTitle('2 · Black hole hit — ElevenLabs candidates (12)'));
    const list = document.createElement('div');
    list.id = 'sfx-lab-candidates';
    list.textContent = 'loading index.json…';
    list.style.color = '#6f8aa8';
    this.page.appendChild(list);

    // Section 3 — procedural deaths
    this.page.appendChild(this.sectionTitle('3 · Black hole death — procedural (for contrast)'));
    const deathRow = document.createElement('div');
    deathRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    for (const v of DEATH_VARIANTS) {
      deathRow.appendChild(this.entryRow({
        label: v,
        keyHint: null,
        available: true,
        prompt: null,
        play: () => this.playDeathVariant(v),
        spam: false,
      }));
    }
    this.page.appendChild(deathRow);

    // Section 4 — ElevenLabs spawn candidates (filled in by loadSpawnCandidates)
    this.page.appendChild(this.sectionTitle('4 · Black hole spawn — ElevenLabs candidates (11)'));
    const spawnList = document.createElement('div');
    spawnList.id = 'sfx-lab-spawn-candidates';
    spawnList.textContent = 'loading index.json…';
    spawnList.style.color = '#6f8aa8';
    this.page.appendChild(spawnList);

    // Section 5 — Artlist candidates (one subsection per category, auto-discovered)
    this.page.appendChild(this.sectionTitle('5 · Artlist candidates — manually downloaded, auto-discovered'));
    const artlistNote = document.createElement('div');
    artlistNote.style.cssText = 'color:#6f8aa8;font-size:10px;margin-bottom:6px;';
    artlistNote.textContent =
      'Download mp3/wav files from Artlist into sounds/artlist-candidates/<category>/ (repo root, git-ignored), ' +
      'then run npm run sfx:sync (web/) to pick them up here — no manifest needed, whatever\'s in the folder shows up.';
    this.page.appendChild(artlistNote);
    for (const cat of this.artlist) {
      const details = document.createElement('details');
      details.style.cssText = 'margin:4px 0;';
      details.open = true;
      const summary = document.createElement('summary');
      summary.style.cssText = 'cursor:pointer;color:#ffc9a0;font-size:11px;';
      summary.textContent = cat.label;
      const list = document.createElement('div');
      list.id = `sfx-lab-artlist-${cat.dir}`;
      list.style.cssText = 'padding:4px 0 4px 12px;color:#6f8aa8;';
      list.textContent = 'loading index.json…';
      details.append(summary, list);
      this.page.appendChild(details);
    }
  }

  private renderCandidates(): void {
    const list = document.getElementById('sfx-lab-candidates') as HTMLDivElement | null;
    if (!list) return;
    list.innerHTML = '';
    list.style.color = '';
    if (this.loadError) {
      list.textContent = this.loadError;
      list.style.color = '#c88a5a';
      return;
    }
    this.entriesRendered = 0;
    this.candidates.forEach((c, i) => {
      const row = this.entryRow({
        label: c.name,
        keyHint: CANDIDATE_KEY_LABELS[i] ?? null,
        available: c.available,
        prompt: c.prompt,
        badge: IN_GAME_BADGES[c.file] ?? null,
        play: () => this.playCandidate(c.id),
      });
      list.appendChild(row);
      this.entriesRendered++;
    });
  }

  private renderSpawnCandidates(): void {
    const list = document.getElementById('sfx-lab-spawn-candidates') as HTMLDivElement | null;
    if (!list) return;
    list.innerHTML = '';
    list.style.color = '';
    if (this.spawnLoadError) {
      list.textContent = this.spawnLoadError;
      list.style.color = '#c88a5a';
      return;
    }
    this.spawnEntriesRendered = 0;
    for (const c of this.spawnCandidates) {
      const row = this.entryRow({
        label: c.name,
        keyHint: null, // spawn rows are click-only (keys 1-9,0,-,= belong to the hit section)
        available: c.available,
        prompt: c.prompt,
        badge: IN_GAME_BADGES[c.file] ?? null,
        play: () => this.playSpawnCandidate(c.id),
      });
      list.appendChild(row);
      this.spawnEntriesRendered++;
    }
  }

  private renderArtlistCategory(cat: ArtlistCategory): void {
    const list = document.getElementById(`sfx-lab-artlist-${cat.dir}`) as HTMLDivElement | null;
    if (!list) return;
    list.innerHTML = '';
    list.style.color = '';
    if (cat.loadError) {
      list.textContent = cat.loadError;
      list.style.color = '#c88a5a';
      return;
    }
    if (cat.candidates.length === 0) {
      list.textContent = `no candidates yet — drop mp3/wav files into sounds/artlist-candidates/${cat.dir}/`;
      list.style.color = '#5a6a7a';
      return;
    }
    for (const c of cat.candidates) {
      const row = this.entryRow({
        label: c.name,
        keyHint: null,
        available: c.available,
        prompt: null,
        play: () => this.playArtlistCandidate(cat.dir, c.id),
      });
      list.appendChild(row);
    }
  }

  private sectionTitle(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = 'color:#ffc9a0;font-weight:bold;margin:14px 0 6px;border-top:1px solid rgba(255,150,60,0.25);padding-top:10px;';
    el.textContent = text;
    return el;
  }

  private sliderRow(label: string, min: number, max: number, step: number, value: number, set: (v: number) => void): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.cssText = 'width:140px;accent-color:#ff9640;';
    const show = document.createElement('span');
    show.style.color = '#9fe8ff';
    show.textContent = String(value);
    input.addEventListener('input', () => {
      set(Number(input.value));
      show.textContent = input.value;
    });
    wrap.append(name, input, show);
    return wrap;
  }

  /** One playable audition row: play button + optional spam toggle + name + prompt. */
  private entryRow(opts: {
    label: string;
    keyHint: string | null;
    available: boolean;
    prompt: string | null;
    badge?: string | null;
    play: () => void;
    spam?: boolean;
  }): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;gap:8px;padding:5px 8px;margin:3px 0;' +
      'background:rgba(12,20,36,0.7);border:1px solid rgba(255,150,60,0.18);border-radius:5px;max-width:900px;';

    if (opts.keyHint) {
      const key = document.createElement('span');
      key.style.cssText = 'color:#6f8aa8;border:1px solid #2a3a52;border-radius:3px;padding:0 5px;';
      key.textContent = opts.keyHint;
      row.appendChild(key);
    }

    const btn = document.createElement('button');
    btn.textContent = opts.available ? '▶ Play' : 'pending';
    btn.disabled = !opts.available;
    btn.style.cssText =
      'background:rgba(255,150,60,0.12);border:1px solid rgba(255,150,60,0.45);border-radius:4px;' +
      `color:${opts.available ? '#ffc9a0' : '#5a6a7a'};font-family:monospace;font-size:11px;padding:3px 10px;` +
      (opts.available ? 'cursor:pointer;' : 'cursor:default;');
    btn.addEventListener('click', opts.play);
    row.appendChild(btn);

    const name = document.createElement('span');
    name.style.cssText = `font-weight:bold;color:${opts.available ? '#fff' : '#7a8a9a'};min-width:150px;`;
    name.textContent = opts.label;
    row.appendChild(name);

    if (!opts.available) {
      const badge = document.createElement('span');
      badge.style.cssText = 'color:#c88a5a;font-size:10px;border:1px dashed rgba(255,150,60,0.4);border-radius:3px;padding:0 5px;';
      badge.textContent = 'pending generation';
      row.appendChild(badge);
    }

    if (opts.badge) {
      const badge = document.createElement('span');
      badge.style.cssText = 'color:#7dff9a;font-size:10px;border:1px solid rgba(125,255,154,0.45);border-radius:3px;padding:0 5px;';
      badge.textContent = opts.badge;
      row.appendChild(badge);
    }

    if (opts.spam !== false && opts.available) {
      const spamState: SpamState = { enabled: false, timer: 0, play: opts.play };
      this.spam.push(spamState);
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:4px;color:#9fe8ff;font-size:10px;cursor:pointer;';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.style.accentColor = '#ff9640';
      box.addEventListener('change', () => {
        spamState.enabled = box.checked;
        spamState.timer = 0;
      });
      label.append(box, document.createTextNode('spam'));
      row.appendChild(label);
    }

    if (opts.prompt) {
      const details = document.createElement('details');
      details.style.cssText = 'flex:1;color:#6f8aa8;font-size:10px;';
      const summary = document.createElement('summary');
      summary.style.cursor = 'pointer';
      summary.textContent = 'prompt';
      const body = document.createElement('div');
      body.style.cssText = 'padding:4px 0 2px;';
      body.textContent = opts.prompt;
      details.append(summary, body);
      row.appendChild(details);
    }

    return row;
  }
}

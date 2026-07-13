import { Renderer } from './renderer/sprite-batch';
import { SpringMassGrid } from './renderer/grid';
import { Starfield } from './renderer/starfield';
import { createProgram } from './renderer/webgl-context';
import fullscreenVert from './renderer/shaders/fullscreen.vert';
import liquidGlassFrag from './renderer/shaders/liquid-glass.frag';
import { gameSettings } from './settings';

/**
 * Liquid Glass Lab (`?liquid=1`) — prototypes a refractive/translucent "liquid glass" material
 * (inspired by Apple's Liquid Glass) as a real GLSL pass, NOT the line renderer. A colourful
 * animated scene (reactive grid + drifting neon blobs) is rendered into an FBO, then a
 * fullscreen shader (`liquid-glass.frag`) composites up to 9 circular glass "lenses" over it —
 * each bends + magnifies the background, disperses light into a chromatic edge, and adds a
 * specular highlight + fresnel rim. Eight variants sit side by side so a look can be picked.
 *
 * Keys (also on window.liquidGlassLab):
 *   1-8  focus one variant large (again / 0 → back to grid)
 *   G scene grid · Space pause · L labels
 */

interface Variant { name: string; desc: string; }

interface Blob { x: number; y: number; vx: number; vy: number; r: number; color: [number, number, number]; }

const VARIANTS: Variant[] = [
  { name: '1 · Clear lens', desc: 'pure optics — convex magnify + faint edge bend' },
  { name: '2 · Liquid droplet', desc: 'the signature: magnify + chromatic edge + specular + rim' },
  { name: '3 · Frosted', desc: 'blurred translucent glass with a cool tint' },
  { name: '4 · Chromatic edge', desc: "Apple's colored rim — strong dispersion at the edge only" },
  { name: '5 · Concave', desc: 'pinch lens — background minified inward' },
  { name: '6 · Gel gloss', desc: 'wet-plastic — big soft specular highlight' },
  { name: '7 · Bubble', desc: 'thin shell — hollow center, bright chromatic rim' },
  { name: '8 · Deep magnify', desc: 'thick convex lens — strong center zoom' },
];

const COLS = 3;

export class LiquidGlassLab {
  private renderer: Renderer;
  private gl: WebGLRenderingContext;
  private grid: SpringMassGrid;
  private starfield: Starfield;

  // Scene FBO + glass shader
  private sceneFB!: WebGLFramebuffer;
  private sceneTex!: WebGLTexture;
  private fbW = 0;
  private fbH = 0;
  private glassProgram: WebGLProgram;
  private quadBuffer: WebGLBuffer;
  private uScene: WebGLUniformLocation | null;
  private uAspect: WebGLUniformLocation | null;
  private uTime: WebGLUniformLocation | null;
  private uCount: WebGLUniformLocation | null;
  private uCenter: WebGLUniformLocation | null;
  private uRadius: WebGLUniformLocation | null;
  private uVariant: WebGLUniformLocation | null;
  private uLight: WebGLUniformLocation | null;
  private aPos: number;

  private blobs: Blob[] = [];
  private totalTime = 0;

  variants = VARIANTS;
  paused = false;
  gridOn = true;
  labelsOn = true;
  focus = -1;

  private labelRoot: HTMLDivElement;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.renderer.zoom = 1;
    this.renderer.resize();
    this.gl = this.renderer.getGL();
    this.grid = new SpringMassGrid(this.gl, false);
    this.grid.rebuild(gameSettings.arenaWidth, gameSettings.arenaHeight, gameSettings.gridSpacing);
    this.starfield = new Starfield(160, gameSettings.arenaWidth, gameSettings.arenaHeight);

    // Glass shader + fullscreen quad
    this.glassProgram = createProgram(this.gl, fullscreenVert, liquidGlassFrag);
    const buf = this.gl.createBuffer()!;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), this.gl.STATIC_DRAW);
    this.quadBuffer = buf;
    const p = this.glassProgram;
    this.uScene = this.gl.getUniformLocation(p, 'u_scene');
    this.uAspect = this.gl.getUniformLocation(p, 'u_aspect');
    this.uTime = this.gl.getUniformLocation(p, 'u_time');
    this.uCount = this.gl.getUniformLocation(p, 'u_count');
    this.uCenter = this.gl.getUniformLocation(p, 'u_center');
    this.uRadius = this.gl.getUniformLocation(p, 'u_radius');
    this.uVariant = this.gl.getUniformLocation(p, 'u_variant');
    this.uLight = this.gl.getUniformLocation(p, 'u_light');
    this.aPos = this.gl.getAttribLocation(p, 'a_position');

    this.ensureSceneFBO();
    this.spawnBlobs();

    this.labelRoot = document.createElement('div');
    this.labelRoot.id = 'liquid-labels';
    this.labelRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:monospace;z-index:20;';
    document.body.appendChild(this.labelRoot);
    this.buildLabels();

    window.addEventListener('resize', () => { this.renderer.resize(); this.ensureSceneFBO(); this.buildLabels(); });
    window.addEventListener('keydown', (e) => this.onKeyDown(e.code));
  }

  private ensureSceneFBO(): void {
    const w = this.renderer.canvasWidth;
    const h = this.renderer.canvasHeight;
    if (w === this.fbW && h === this.fbH && this.sceneFB) return;
    const gl = this.gl;
    if (this.sceneFB) { gl.deleteFramebuffer(this.sceneFB); gl.deleteTexture(this.sceneTex); }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.sceneFB = fb; this.sceneTex = tex; this.fbW = w; this.fbH = h;
  }

  private spawnBlobs(): void {
    const w = this.renderer.width;
    const h = this.renderer.height;
    const palette: [number, number, number][] = [
      [1.0, 0.2, 0.5], [0.2, 0.8, 1.0], [1.0, 0.7, 0.1],
      [0.5, 0.3, 1.0], [0.1, 1.0, 0.6], [1.0, 0.35, 0.15],
    ];
    this.blobs = [];
    for (let i = 0; i < 11; i++) {
      this.blobs.push({
        x: (Math.random() - 0.5) * w,
        y: (Math.random() - 0.5) * h,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        r: 40 + Math.random() * 90,
        color: palette[i % palette.length],
      });
    }
  }

  // ============================================================
  // Lens layout (UV space; uv (0,0) = bottom-left)
  // ============================================================
  private lensCount(): number { return this.focus >= 0 ? 1 : VARIANTS.length; }

  private lensAt(i: number): { cx: number; cy: number; r: number; variant: number } {
    if (this.focus >= 0) return { cx: 0.5, cy: 0.5, r: 0.34, variant: this.focus };
    const rows = Math.ceil(VARIANTS.length / COLS);
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const rowItems = Math.min(COLS, VARIANTS.length - r * COLS);
    const cx = 0.5 + (c - (rowItems - 1) / 2) * 0.3;
    const cy = 0.5 + ((rows - 1) / 2 - r) * 0.34;
    return { cx, cy, r: 0.135, variant: i };
  }

  // ============================================================
  // Loop
  // ============================================================
  update(dt: number): void {
    if (this.paused) return;
    this.totalTime += dt;
    const w = this.renderer.width;
    const h = this.renderer.height;
    for (const b of this.blobs) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -w / 2 || b.x > w / 2) b.vx *= -1;
      if (b.y < -h / 2 || b.y > h / 2) b.vy *= -1;
      // gentle grid ripple so the fabric moves under the glass
      this.grid.applyImpulse(b.x, b.y, -6, b.r * 1.2);
    }
    this.grid.update(dt);
  }

  private renderScene(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFB);
    gl.viewport(0, 0, this.fbW, this.fbH);
    gl.clearColor(0.02, 0.02, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.gridOn) this.grid.render(0, 0, this.renderer.width, this.renderer.height);
    this.renderer.begin(false);
    this.starfield.render(this.renderer, 0, 0);
    this.renderer.setBlendMode('additive');
    for (const b of this.blobs) {
      this.renderer.drawFilledCircle(b.x, b.y, b.r, b.color, 40, 0.5);
      this.renderer.drawFilledCircle(b.x, b.y, b.r * 0.6, b.color, 40, 0.5);
    }
    this.renderer.setBlendMode('normal');
    this.renderer.end();
  }

  render(): void {
    this.renderer.cameraX = 0;
    this.renderer.cameraY = 0;
    this.ensureSceneFBO();
    this.renderScene();

    // Glass composite pass → default framebuffer.
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.renderer.canvasWidth, this.renderer.canvasHeight);
    gl.disable(gl.BLEND);
    gl.useProgram(this.glassProgram);

    const n = this.lensCount();
    const centers = new Float32Array(9 * 2);
    const radii = new Float32Array(9);
    const variants = new Float32Array(9);
    for (let i = 0; i < n; i++) {
      const l = this.lensAt(i);
      centers[i * 2] = l.cx; centers[i * 2 + 1] = l.cy;
      radii[i] = l.r; variants[i] = l.variant;
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.uniform1i(this.uScene, 0);
    gl.uniform1f(this.uAspect, this.fbW / this.fbH);
    gl.uniform1f(this.uTime, this.totalTime / 1000);
    gl.uniform1i(this.uCount, n);
    gl.uniform2fv(this.uCenter, centers);
    gl.uniform1fv(this.uRadius, radii);
    gl.uniform1fv(this.uVariant, variants);
    const la = this.totalTime * 0.00025;
    gl.uniform2f(this.uLight, Math.cos(la), Math.sin(la));

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // ============================================================
  // Labels
  // ============================================================
  private uvToScreen(cx: number, cy: number): { x: number; y: number } {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    return { x: cx * cssW, y: (1 - cy) * cssH };
  }

  private buildLabels(): void {
    this.labelRoot.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText =
      'position:absolute;left:50%;top:8px;transform:translateX(-50%);color:#bfe9ff;' +
      'font-size:15px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 8px #3af;';
    title.textContent = 'LIQUID GLASS LAB — REFRACTIVE MATERIAL VARIANTS';
    this.labelRoot.appendChild(title);
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;left:50%;top:30px;transform:translateX(-50%);color:#7bd;font-size:11px;';
    hint.textContent = '1-8 focus · G scene grid · Space pause · L labels';
    this.labelRoot.appendChild(hint);

    const cssW = this.canvas.clientWidth || window.innerWidth;
    for (let i = 0; i < this.lensCount(); i++) {
      const l = this.lensAt(i);
      const s = this.uvToScreen(l.cx, l.cy - l.r - 0.03);
      const v = VARIANTS[l.variant];
      const wrap = document.createElement('div');
      const width = this.focus >= 0 ? 320 : cssW / COLS - 40;
      wrap.style.cssText =
        `position:absolute;left:${s.x}px;top:${s.y}px;transform:translate(-50%,0);width:${width}px;text-align:center;`;
      const nm = document.createElement('div');
      nm.style.cssText = 'color:#eaf7ff;font-size:12px;font-weight:bold;text-shadow:0 0 4px #000;';
      nm.textContent = v.name;
      const ds = document.createElement('div');
      ds.style.cssText = 'color:#bcd;font-size:9.5px;line-height:1.2;margin-top:2px;text-shadow:0 0 4px #000;';
      ds.textContent = v.desc;
      wrap.append(nm, ds);
      this.labelRoot.appendChild(wrap);
    }
  }

  private onKeyDown(code: string): void {
    if (code.startsWith('Digit')) {
      const nkey = parseInt(code.slice(5), 10);
      if (nkey === 0) this.focus = -1;
      else if (nkey >= 1 && nkey <= VARIANTS.length) this.focus = this.focus === nkey - 1 ? -1 : nkey - 1;
      this.buildLabels();
      return;
    }
    switch (code) {
      case 'Space': this.paused = !this.paused; break;
      case 'KeyG': this.gridOn = !this.gridOn; break;
      case 'KeyL':
        this.labelsOn = !this.labelsOn;
        this.labelRoot.style.display = this.labelsOn ? 'block' : 'none';
        break;
    }
  }
}

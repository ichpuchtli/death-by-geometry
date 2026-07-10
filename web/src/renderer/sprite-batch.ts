import { createProgram } from './webgl-context';
import entityVert from './shaders/entity.vert';
import entityFrag from './shaders/entity.frag';
import { gameSettings } from '../settings';

// Each vertex: x, y, r, g, b, a (6 floats)
const FLOATS_PER_VERTEX = 6;
const MAX_VERTICES = 64000;

export class Renderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private data: Float32Array;
  private vertexCount = 0;

  // Uniform locations
  private uResolution: WebGLUniformLocation;
  private uCamera: WebGLUniformLocation;

  // Attribute locations
  private aPosition: number;
  private aColor: number;

  // Current draw mode batch
  private currentMode: number = 0; // gl.LINES or gl.TRIANGLES
  private batches: { mode: number; start: number; count: number }[] = [];

  public width = 0;
  public height = 0;
  public canvasWidth = 0;
  public canvasHeight = 0;
  public cameraX = 0;
  public cameraY = 0;
  public zoom = 1.0;
  private blendMode: 'normal' | 'additive' = 'normal';

  // --- Tidal warp field (spaghettification of dying units) ---
  // While active, every emitted vertex within warpRadius of (warpCX, warpCY) is pulled
  // radially inward (stronger closer in → the shape elongates like taffy) and twisted
  // around the centre (frame dragging). Set it around a dying enemy's render() call.
  private warpActive = false;
  private warpCX = 0;
  private warpCY = 0;
  private warpK = 0;       // 0..1 intensity
  private warpStretch = 0; // inward tidal displacement scale
  private warpTwist = 0;   // radians of swirl at the core
  private warpRadius = 1;

  getGL(): WebGLRenderingContext { return this.gl; }

  /** Enable the tidal warp for subsequent draw calls (call clearWarp() after). */
  setWarp(cx: number, cy: number, k: number, stretch: number, twist: number, radius: number): void {
    this.warpActive = k > 0.001;
    this.warpCX = cx;
    this.warpCY = cy;
    this.warpK = k;
    this.warpStretch = stretch;
    this.warpTwist = twist;
    this.warpRadius = radius;
  }

  clearWarp(): void {
    this.warpActive = false;
  }

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true })
      || canvas.getContext('experimental-webgl', { alpha: false, antialias: true });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl as WebGLRenderingContext;

    this.program = createProgram(this.gl, entityVert, entityFrag);
    this.gl.useProgram(this.program);

    // Uniforms
    this.uResolution = this.gl.getUniformLocation(this.program, 'u_resolution')!;
    this.uCamera = this.gl.getUniformLocation(this.program, 'u_camera')!;

    // Attributes
    this.aPosition = this.gl.getAttribLocation(this.program, 'a_position');
    this.aColor = this.gl.getAttribLocation(this.program, 'a_color');

    // Buffer
    const buf = this.gl.createBuffer();
    if (!buf) throw new Error('Failed to create buffer');
    this.buffer = buf;
    this.data = new Float32Array(MAX_VERTICES * FLOATS_PER_VERTEX);

    // Enable blending for alpha
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

    this.resize();
  }

  resize(): void {
    const dpr = (window.devicePixelRatio || 1) * gameSettings.resolutionScale;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    this.canvas.width = cssW * dpr;
    this.canvas.height = cssH * dpr;
    this.canvasWidth = this.canvas.width;
    this.canvasHeight = this.canvas.height;
    // Virtual dimensions: zoom < 1 shows more of the world
    this.width = cssW / this.zoom;
    this.height = cssH / this.zoom;
    this.gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
  }

  begin(clear: boolean = true): void {
    this.vertexCount = 0;
    this.batches.length = 0;
    this.currentMode = 0;
    if (clear) {
      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
  }

  private pushVertex(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (this.vertexCount >= MAX_VERTICES) return;
    if (this.warpActive) {
      const dx = x - this.warpCX;
      const dy = y - this.warpCY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.001 && dist < this.warpRadius) {
        // closeness: 0 at the edge of influence → 1 at the centre (eased)
        let c = 1 - dist / this.warpRadius;
        c *= c;
        // Frame-drag twist: rotate the vertex around the centre, more near the core
        const ang = this.warpK * this.warpTwist * c;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const rx = dx * cosA - dy * sinA;
        const ry = dx * sinA + dy * cosA;
        // Tidal inward pull, stronger closer in → near vertices lead, the shape stretches
        let delta = this.warpK * this.warpStretch * c * this.warpRadius;
        if (delta > dist * 0.85) delta = dist * 0.85;
        const scale = (dist - delta) / dist;
        x = this.warpCX + rx * scale;
        y = this.warpCY + ry * scale;
      }
    }
    const i = this.vertexCount * FLOATS_PER_VERTEX;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = r;
    this.data[i + 3] = g;
    this.data[i + 4] = b;
    this.data[i + 5] = a;
    this.vertexCount++;
  }

  private ensureMode(mode: number): void {
    if (this.currentMode !== mode) {
      this.currentMode = mode;
      this.batches.push({ mode, start: this.vertexCount, count: 0 });
    }
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, r: number, g: number, b: number, a: number = 1): void {
    this.ensureMode(this.gl.LINES);
    this.pushVertex(x1, y1, r, g, b, a);
    this.pushVertex(x2, y2, r, g, b, a);
    this.batches[this.batches.length - 1].count += 2;
  }

  drawTriangle(
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    r: number, g: number, b: number, a: number = 1,
  ): void {
    this.ensureMode(this.gl.TRIANGLES);
    this.pushVertex(x1, y1, r, g, b, a);
    this.pushVertex(x2, y2, r, g, b, a);
    this.pushVertex(x3, y3, r, g, b, a);
    this.batches[this.batches.length - 1].count += 3;
  }

  /** Draw a line loop from an array of [x,y] points — connects last to first */
  drawLineLoop(points: number[][], color: [number, number, number], alpha: number = 1): void {
    const [r, g, b] = color;
    for (let i = 0; i < points.length; i++) {
      const next = (i + 1) % points.length;
      this.drawLine(
        points[i][0], points[i][1],
        points[next][0], points[next][1],
        r, g, b, alpha,
      );
    }
  }

  /** Draw a circle approximation using line segments */
  drawCircle(cx: number, cy: number, radius: number, color: [number, number, number], segments: number = 24, alpha: number = 1): void {
    const [r, g, b] = color;
    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      const a1 = i * step;
      const a2 = (i + 1) * step;
      this.drawLine(
        cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius,
        cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius,
        r, g, b, alpha,
      );
    }
  }

  /** Draw a filled circle using triangle fan */
  drawFilledCircle(cx: number, cy: number, radius: number, color: [number, number, number], segments: number = 24, alpha: number = 1): void {
    const [r, g, b] = color;
    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      const a1 = i * step;
      const a2 = (i + 1) * step;
      this.drawTriangle(
        cx, cy,
        cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius,
        cx + Math.cos(a2) * radius, cy + Math.sin(a2) * radius,
        r, g, b, alpha,
      );
    }
  }

  /** Flush current batch, switch blend mode, start new batch */
  setBlendMode(mode: 'normal' | 'additive'): void {
    if (mode === this.blendMode) return;
    this.end();
    this.blendMode = mode;
    const gl = this.gl;
    if (mode === 'additive') {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    this.begin(false);
  }

  end(): void {
    const gl = this.gl;
    gl.useProgram(this.program);

    // Upload data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.vertexCount * FLOATS_PER_VERTEX), gl.DYNAMIC_DRAW);

    // Set up attributes
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(this.aPosition);
    gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, stride, 8);

    // Set uniforms
    gl.uniform2f(this.uResolution, this.width, this.height);
    gl.uniform2f(this.uCamera, this.cameraX, this.cameraY);

    // Draw each batch
    for (const batch of this.batches) {
      gl.drawArrays(batch.mode, batch.start, batch.count);
    }
  }
}

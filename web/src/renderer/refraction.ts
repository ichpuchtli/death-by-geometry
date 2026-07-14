import { createProgram } from './webgl-context';
import fullscreenVert from './shaders/fullscreen.vert';
import liquidGlassFrag from './shaders/liquid-glass.frag';

export interface Lens {
  cx: number; // UV center x (0..1)
  cy: number; // UV center y (0..1)
  r: number;  // radius in y-normalized units
}

const MAX = 9; // shader loop bound
const CONCAVE_VARIANT = 4; // "5 · Concave" in liquid-glass.frag (0-indexed)

/**
 * Screen-space refraction pass — reuses `liquid-glass.frag` to lens the rendered scene behind
 * BlackHoles with a concave "pinch" (gravitational lensing), the look picked in the Liquid
 * Glass Lab. Reads a source scene texture, composites up to 9 concave lenses over it, and
 * writes the refracted result to its own FBO (fed back into bloom as the scene input).
 */
export class RefractionPass {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private quad: WebGLBuffer;
  private fbo: WebGLFramebuffer | null = null;
  private tex: WebGLTexture | null = null;
  private w = 0;
  private h = 0;

  private uScene: WebGLUniformLocation | null;
  private uAspect: WebGLUniformLocation | null;
  private uTime: WebGLUniformLocation | null;
  private uCount: WebGLUniformLocation | null;
  private uCenter: WebGLUniformLocation | null;
  private uRadius: WebGLUniformLocation | null;
  private uVariant: WebGLUniformLocation | null;
  private uLight: WebGLUniformLocation | null;
  private uTMag: WebGLUniformLocation | null;
  private uTRef: WebGLUniformLocation | null;
  private uTChr: WebGLUniformLocation | null;
  private uTSpec: WebGLUniformLocation | null;
  private uTRim: WebGLUniformLocation | null;
  private uTFrost: WebGLUniformLocation | null;
  private aPos: number;

  // Reused scratch buffers (variant is constant = concave for every lens).
  private centers = new Float32Array(MAX * 2);
  private radii = new Float32Array(MAX);
  private variants = new Float32Array(MAX).fill(CONCAVE_VARIANT);

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, fullscreenVert, liquidGlassFrag);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    this.quad = buf;
    const p = this.program;
    this.uScene = gl.getUniformLocation(p, 'u_scene');
    this.uAspect = gl.getUniformLocation(p, 'u_aspect');
    this.uTime = gl.getUniformLocation(p, 'u_time');
    this.uCount = gl.getUniformLocation(p, 'u_count');
    this.uCenter = gl.getUniformLocation(p, 'u_center');
    this.uRadius = gl.getUniformLocation(p, 'u_radius');
    this.uVariant = gl.getUniformLocation(p, 'u_variant');
    this.uLight = gl.getUniformLocation(p, 'u_light');
    this.uTMag = gl.getUniformLocation(p, 'u_tMag');
    this.uTRef = gl.getUniformLocation(p, 'u_tRef');
    this.uTChr = gl.getUniformLocation(p, 'u_tChr');
    this.uTSpec = gl.getUniformLocation(p, 'u_tSpec');
    this.uTRim = gl.getUniformLocation(p, 'u_tRim');
    this.uTFrost = gl.getUniformLocation(p, 'u_tFrost');
    this.aPos = gl.getAttribLocation(p, 'a_position');
  }

  resize(width: number, height: number): void {
    if (width === this.w && height === this.h && this.fbo) return;
    const gl = this.gl;
    if (this.fbo) { gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.tex); }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbo = fb; this.tex = tex; this.w = width; this.h = height;
  }

  /**
   * Refract `sourceTex` through the given concave lenses and return the result texture.
   * `pinch` is the concave-magnify multiplier (BH_REFRACTION_PINCH). No-op passthrough is the
   * caller's job (only call when there is at least one lens).
   */
  apply(sourceTex: WebGLTexture, aspect: number, timeSec: number, lenses: Lens[], pinch: number): WebGLTexture {
    const gl = this.gl;
    const n = Math.min(lenses.length, MAX);
    for (let i = 0; i < n; i++) {
      this.centers[i * 2] = lenses[i].cx;
      this.centers[i * 2 + 1] = lenses[i].cy;
      this.radii[i] = lenses[i].r;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.uniform1i(this.uScene, 0);
    gl.uniform1f(this.uAspect, aspect);
    gl.uniform1f(this.uTime, timeSec);
    gl.uniform1i(this.uCount, n);
    gl.uniform2fv(this.uCenter, this.centers);
    gl.uniform1fv(this.uRadius, this.radii);
    gl.uniform1fv(this.uVariant, this.variants);
    const la = timeSec * 0.25;
    gl.uniform2f(this.uLight, Math.cos(la), Math.sin(la));
    gl.uniform1f(this.uTMag, pinch);
    gl.uniform1f(this.uTRef, 1);
    gl.uniform1f(this.uTChr, 1);
    gl.uniform1f(this.uTSpec, 1);
    gl.uniform1f(this.uTRim, 1);
    gl.uniform1f(this.uTFrost, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.BLEND);

    return this.tex!;
  }
}

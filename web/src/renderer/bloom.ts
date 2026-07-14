import { createProgram } from './webgl-context';
import fullscreenVert from './shaders/fullscreen.vert';
import bloomExtractFrag from './shaders/bloom-extract.frag';
import bloomBlurFrag from './shaders/bloom-blur.frag';
import bloomCompositeFrag from './shaders/bloom-composite.frag';

interface FBO {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export class BloomPass {
  private gl: WebGLRenderingContext;
  private quadBuffer: WebGLBuffer;

  // Scene FBO (full resolution — entities render here)
  sceneFBO!: FBO;

  // Bloom FBOs (half resolution)
  private extractFBO!: FBO;
  private pingFBO!: FBO;
  private pongFBO!: FBO;

  // Shader programs
  private extractProgram: WebGLProgram;
  private blurProgram: WebGLProgram;
  private compositeProgram: WebGLProgram;

  // Tuning
  threshold = 0.15;
  intensity = 1.4;
  blurPasses = 4;
  blurRadius = 1.5;
  shakeIntensity = 0; // 0-1, drives chromatic aberration + barrel warp
  time = 0;


  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;

    // Fullscreen quad
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);
    this.quadBuffer = buf;

    // Compile programs
    this.extractProgram = createProgram(gl, fullscreenVert, bloomExtractFrag);
    this.blurProgram = createProgram(gl, fullscreenVert, bloomBlurFrag);
    this.compositeProgram = createProgram(gl, fullscreenVert, bloomCompositeFrag);
  }

  private createFBO(width: number, height: number): FBO {
    const gl = this.gl;
    const fb = gl.createFramebuffer()!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { framebuffer: fb, texture: tex, width, height };
  }

  resize(fullWidth: number, fullHeight: number): void {
    const halfW = Math.max(1, Math.floor(fullWidth / 2));
    const halfH = Math.max(1, Math.floor(fullHeight / 2));
    this.sceneFBO = this.createFBO(fullWidth, fullHeight);
    this.extractFBO = this.createFBO(halfW, halfH);
    this.pingFBO = this.createFBO(halfW, halfH);
    this.pongFBO = this.createFBO(halfW, halfH);
  }

  /** Bind scene FBO — all game rendering should target this */
  bindSceneFBO(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO.framebuffer);
    gl.viewport(0, 0, this.sceneFBO.width, this.sceneFBO.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private drawQuad(program: WebGLProgram): void {
    const gl = this.gl;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** Run the full bloom pipeline and composite to screen */
  apply(canvasWidth: number, canvasHeight: number): void {
    const gl = this.gl;

    // Disable blending for fullscreen passes — otherwise alpha=0 fragments
    // from the extract shader blend with old FBO data instead of overwriting
    gl.disable(gl.BLEND);

    // --- Step 1: Extract bright pixels ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.extractFBO.framebuffer);
    gl.viewport(0, 0, this.extractFBO.width, this.extractFBO.height);
    gl.useProgram(this.extractProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.texture);
    gl.uniform1i(gl.getUniformLocation(this.extractProgram, 'u_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(this.extractProgram, 'u_threshold'), this.threshold);
    this.drawQuad(this.extractProgram);

    // --- Step 2: Gaussian blur passes (ping-pong) ---
    let readFBO = this.extractFBO;
    let writeFBO = this.pingFBO;
    for (let i = 0; i < this.blurPasses; i++) {
      // Horizontal
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.framebuffer);
      gl.viewport(0, 0, writeFBO.width, writeFBO.height);
      gl.useProgram(this.blurProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readFBO.texture);
      gl.uniform1i(gl.getUniformLocation(this.blurProgram, 'u_texture'), 0);
      gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'u_direction'), 1.0 / writeFBO.width, 0);
      gl.uniform1f(gl.getUniformLocation(this.blurProgram, 'u_radius'), this.blurRadius);
      this.drawQuad(this.blurProgram);

      readFBO = writeFBO;
      writeFBO = writeFBO === this.pingFBO ? this.pongFBO : this.pingFBO;

      // Vertical
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.framebuffer);
      gl.viewport(0, 0, writeFBO.width, writeFBO.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readFBO.texture);
      gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'u_direction'), 0, 1.0 / writeFBO.height);
      this.drawQuad(this.blurProgram);

      readFBO = writeFBO;
      writeFBO = writeFBO === this.pingFBO ? this.pongFBO : this.pingFBO;
    }

    // --- Step 3: Composite bloom onto original scene ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvasWidth, canvasHeight);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneFBO.texture);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_scene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readFBO.texture);
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'u_bloom'), 1);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_bloomIntensity'), this.intensity);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_shakeIntensity'), this.shakeIntensity);
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'u_time'), this.time);

    this.drawQuad(this.compositeProgram);

    // Re-enable blending for next frame's entity rendering
    gl.enable(gl.BLEND);
  }
}

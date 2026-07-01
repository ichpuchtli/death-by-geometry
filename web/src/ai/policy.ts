/**
 * A tiny fully-connected neural-network policy (MLP) with a pure-TypeScript forward
 * pass — no ML framework. The identical forward code runs in the Node trainer and in
 * the browser bot, and weights serialize to plain JSON.
 *
 * Trained via neuroevolution (Cross-Entropy Method) in `ai/train.ts`, which only needs
 * the flat parameter get/set below — no gradients, no autodiff.
 */

export interface PolicyJSON {
  arch: number[];
  params: number[];
}

export class Policy {
  readonly arch: number[];
  // Per-layer weight matrices (row-major: out×in) and bias vectors.
  private W: Float32Array[] = [];
  private b: Float32Array[] = [];

  constructor(arch: number[]) {
    this.arch = arch.slice();
    for (let l = 0; l < arch.length - 1; l++) {
      this.W.push(new Float32Array(arch[l + 1] * arch[l]));
      this.b.push(new Float32Array(arch[l + 1]));
    }
  }

  /** Total number of trainable parameters for a given architecture. */
  static paramCount(arch: number[]): number {
    let n = 0;
    for (let l = 0; l < arch.length - 1; l++) {
      n += arch[l + 1] * arch[l] + arch[l + 1];
    }
    return n;
  }

  get paramCount(): number {
    return Policy.paramCount(this.arch);
  }

  /** Flatten all weights + biases into one contiguous array (for the evolution loop). */
  getFlat(out: Float32Array = new Float32Array(this.paramCount)): Float32Array {
    let o = 0;
    for (let l = 0; l < this.W.length; l++) {
      out.set(this.W[l], o); o += this.W[l].length;
      out.set(this.b[l], o); o += this.b[l].length;
    }
    return out;
  }

  /** Load flat parameters back into the layer buffers. */
  setFlat(flat: ArrayLike<number>): void {
    let o = 0;
    for (let l = 0; l < this.W.length; l++) {
      for (let i = 0; i < this.W[l].length; i++) this.W[l][i] = flat[o++];
      for (let i = 0; i < this.b[l].length; i++) this.b[l][i] = flat[o++];
    }
  }

  /**
   * Forward pass. `tanh` on every layer keeps hidden activations bounded and the output
   * in [-1, 1], which the action decoder interprets as move/aim vectors.
   */
  forward(input: Float32Array): Float32Array {
    let a: Float32Array = input;
    for (let l = 0; l < this.W.length; l++) {
      const w = this.W[l];
      const bias = this.b[l];
      const inN = this.arch[l];
      const outN = this.arch[l + 1];
      const z = new Float32Array(outN);
      for (let o = 0; o < outN; o++) {
        let sum = bias[o];
        const base = o * inN;
        for (let i = 0; i < inN; i++) sum += w[base + i] * a[i];
        z[o] = Math.tanh(sum);
      }
      a = z;
    }
    return a;
  }

  toJSON(): PolicyJSON {
    return { arch: this.arch.slice(), params: Array.from(this.getFlat()) };
  }

  static fromJSON(json: PolicyJSON): Policy {
    const p = new Policy(json.arch);
    p.setFlat(json.params);
    return p;
  }
}

'use strict';
// ── Simulator ────────────────────────────────────────────────────────────────
//
// Evaluates a netlist (array of HDL stmts) with:
//   • combinational settle (max 64 iterations; loop → error)
//   • rising-edge DFF clock (tick captures D→Q, then settle)
//   • truth table for pure-combinational circuits (no DFF)

class Simulator {
  /** @param {object[]} stmts */
  constructor(stmts) {
    this.stmts  = stmts;
    this.values = Object.create(null);  // signal name → 0|1
    this._dffQ  = Object.create(null);  // DFF Q state

    for (const s of stmts) {
      if (s.op === 'IN')  this.values[s.out] = 0;
      if (s.op === 'DFF') { this._dffQ[s.out] = 0; this.values[s.out] = 0; }
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** All IN stmts */
  inputStmts() { return this.stmts.filter(s => s.op === 'IN'); }

  /** All OUT stmts */
  outputStmts() { return this.stmts.filter(s => s.op === 'OUT'); }

  hasDFF() { return this.stmts.some(s => s.op === 'DFF'); }

  /** Read a signal (0 if undefined) */
  _v(name) { return this.values[name] ?? 0; }

  setInput(name, val) { this.values[name] = val ? 1 : 0; }

  // ── combinational settle ──────────────────────────────────────────────────

  /**
   * Iteratively evaluate all non-DFF gates until stable.
   * @returns {{ ok: true, iterations: number } | { error: string }}
   */
  settle() {
    const MAX = 64;
    for (let iter = 0; iter < MAX; iter++) {
      let changed = false;
      for (const s of this.stmts) {
        let v;
        const a0 = this._v(s.args[0]);
        const a1 = this._v(s.args[1]);
        switch (s.op) {
          case 'IN':   v = this.values[s.out] ?? 0;  break;
          case 'DFF':  v = this._dffQ[s.out] ?? 0;   break;
          case 'NOT':  v = a0 ^ 1;                    break;
          case 'AND':  v = a0 & a1;                   break;
          case 'OR':   v = a0 | a1;                   break;
          case 'XOR':  v = a0 ^ a1;                   break;
          case 'NAND': v = (a0 & a1) ^ 1;             break;
          case 'NOR':  v = (a0 | a1) ^ 1;             break;
          case 'XNOR': v = (a0 ^ a1) ^ 1;             break;
          case 'OUT':  v = a0;                         break;
          default:     v = 0;
        }
        if (this.values[s.out] !== v) { this.values[s.out] = v; changed = true; }
      }
      if (!changed) return { ok: true, iterations: iter + 1 };
    }
    return { error: 'Combinational loop detected (exceeded 64 iterations)' };
  }

  // ── clock ─────────────────────────────────────────────────────────────────

  /**
   * Rising clock edge: capture D inputs for all DFFs, then settle.
   * @returns same as settle()
   */
  tick() {
    // Sample D for every DFF before updating any
    const captured = Object.create(null);
    for (const s of this.stmts) {
      if (s.op === 'DFF') captured[s.out] = this._v(s.args[0]);
    }
    for (const [k, v] of Object.entries(captured)) {
      this._dffQ[k] = v;
      this.values[k] = v;
    }
    return this.settle();
  }

  /** Reset all signals and DFF state to 0, re-settle. */
  reset() {
    this.values = Object.create(null);
    this._dffQ  = Object.create(null);
    for (const s of this.stmts) {
      if (s.op === 'IN')  this.values[s.out] = 0;
      if (s.op === 'DFF') { this._dffQ[s.out] = 0; this.values[s.out] = 0; }
    }
    this.settle();
  }

  // ── truth table ───────────────────────────────────────────────────────────

  /**
   * Enumerate all 2^n input combinations for a combinational circuit.
   * Returns null for sequential circuits or > 8 inputs.
   *
   * @returns {{ inNames:string[], outNames:string[], rows:{ins:number[],outs:number[]}[] } | null}
   */
  truthTable() {
    if (this.hasDFF()) return null;

    const ins  = this.inputStmts();
    const outs = this.outputStmts();
    const n    = ins.length;
    if (n === 0 || n > 8) return null;

    const saved = { ...this.values };
    const rows  = [];

    for (let mask = 0; mask < (1 << n); mask++) {
      // Set inputs from MSB→LSB
      for (let i = 0; i < n; i++) {
        this.values[ins[i].out] = (mask >> (n - 1 - i)) & 1;
      }
      this.settle();
      rows.push({
        ins:  ins.map(s => this.values[s.out]),
        outs: outs.map(s => this.values[s.out])
      });
    }

    // Restore original state
    Object.assign(this.values, saved);
    this.settle();

    return {
      inNames:  ins.map(s => s.out),
      outNames: outs.map(s => s.out),
      rows
    };
  }

  /** Snapshot of current signal values */
  snapshot() { return { ...this.values }; }
}

import type { Frame, Line, Style } from "../types";
import { BIT, brailleChar } from "./braille";

// geometry is in units of one cell width; a cell is 1 unit wide, 2 units tall
export class Canvas {
  readonly subX: number;
  readonly subY: number;
  private mask: Uint8Array;
  private pri: Int8Array;
  private sty: Int16Array;
  private ch: (string | null)[];
  private styles: Style[] = [];
  private styleIx = new Map<Style, number>();

  constructor(readonly w: number, readonly h: number, readonly ascii: boolean) {
    this.subX = ascii ? 1 : 2;
    this.subY = ascii ? 1 : 4;
    const n = w * h;
    this.mask = new Uint8Array(n);
    this.pri = new Int8Array(n).fill(-1);
    this.sty = new Int16Array(n).fill(-1);
    this.ch = new Array(n).fill(null);
  }

  private ix(s: Style) {
    let i = this.styleIx.get(s);
    if (i === undefined) { i = this.styles.length; this.styles.push(s); this.styleIx.set(s, i); }
    return i;
  }

  // higher pri wipes lower dots in the same cell so a cell keeps one colour; keep=true recolours without wiping
  dot(ux: number, uy: number, pri: number, s: Style, asciiCh = ".", keep = false) {
    const dx = Math.floor(ux * this.subX), dy = Math.floor((uy * this.subY) / 2);
    if (dx < 0 || dy < 0) return;
    const cx = Math.floor(dx / this.subX), cy = Math.floor(dy / this.subY);
    if (cx >= this.w || cy >= this.h) return;
    const c = cy * this.w + cx;
    if (pri < this.pri[c]) return;
    if (pri > this.pri[c]) { if (!keep) this.mask[c] = 0; this.pri[c] = pri; this.sty[c] = this.ix(s); this.ch[c] = null; }
    if (this.ascii) this.ch[c] = asciiCh;
    else this.mask[c] |= BIT[dy % 4][dx % 2];
  }

  text(cx: number, cy: number, str: string, pri: number, s: Style) {
    if (cy < 0 || cy >= this.h) return;
    for (let i = 0; i < str.length; i++) {
      const x = cx + i;
      if (x < 0 || x >= this.w) continue;
      const c = cy * this.w + x;
      if (pri < this.pri[c]) continue;
      this.pri[c] = pri; this.sty[c] = this.ix(s); this.ch[c] = str[i]; this.mask[c] = 0;
    }
  }

  frame(): Frame {
    const lines: Line[] = [];
    let key = "";
    for (let y = 0; y < this.h; y++) {
      const line: Line = [];
      let run = "", rs = -1;
      const flush = () => { if (run) { line.push(rs >= 0 ? { ...this.styles[rs], text: run } : { text: run }); key += rs + run; } };
      for (let x = 0; x < this.w; x++) {
        const c = y * this.w + x;
        const g = this.ch[c] ?? (this.mask[c] ? brailleChar(this.mask[c]) : " ");
        // spaces join whatever run they sit in
        const s = g === " " ? -1 : this.sty[c];
        if (s !== -1 && s !== rs) {
          if (rs === -1) rs = s;
          else { flush(); run = ""; rs = s; }
        }
        run += g;
      }
      flush();
      lines.push(line);
      key += "\n";
    }
    return { lines, key };
  }
}

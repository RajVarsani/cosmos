import type { Line, Seg } from "../types";

// one SGR string per line keeps Ink at ~one node per row
type Level = 0 | 256 | 16777216;
export const colorLevel = (): Level =>
  "NO_COLOR" in process.env ? 0 : /truecolor|24bit/i.test(process.env.COLORTERM ?? "") ? 16777216 : 256;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const cube = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.floor((v - 35) / 40));

function fg(hex: string, level: Level) {
  const [r, g, b] = rgb(hex);
  if (level === 16777216) return `38;2;${r};${g};${b}`;
  return `38;5;${16 + 36 * cube(r) + 6 * cube(g) + cube(b)}`;
}

const sgr = (s: Seg, level: Level) => {
  if (!level) return s.text;
  const codes = [s.bold && "1", s.dim && "2", s.color && fg(s.color, level)].filter(Boolean);
  return codes.length ? `\x1b[${codes.join(";")}m${s.text}\x1b[0m` : s.text;
};

export const encodeLine = (l: Line, level: Level) => l.map((s) => sgr(s, level)).join("");

// subsequence match; contiguous runs and word starts score higher
export function score(q: string, s: string) {
  s = s.toLowerCase();
  let i = 0, sc = 0, last = -2;
  for (const ch of q) {
    if (ch === " ") continue;
    const j = s.indexOf(ch, i);
    if (j < 0) return -1;
    sc += j === last + 1 ? 3 : j === 0 || /[\s\-/·.]/.test(s[j - 1]) ? 2 : 1;
    last = j; i = j + 1;
  }
  return sc - s.length * 0.01;
}

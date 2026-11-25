const HOME = /^(\/Users|\/home)\/[^/]+/;
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const short = (sha?: string | null, n = 7) => (sha ? sha.slice(0, n) : "—");
export const tilde = (p?: string | null) => (p ? p.replace(HOME, "~") : "");

export function dur(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad2(s % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${pad2(m % 60)}m`;
  return `${Math.floor(h / 24)}d ${pad2(h % 24)}h`;
}
export const ago = (iso?: string | null) => (iso ? dur(Date.now() - Date.parse(iso)) : "—");
export const mib = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : n >= 1024 ? `${(n / 1024).toFixed(2)} GiB` : `${Math.round(n)} MiB`);
export const gib = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `${(n / 1024).toFixed(1)} GiB`);
export const nf = (n: number) => Math.round(n).toLocaleString("en-US");
export const clock = (t: number | Date) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
export const clockMs = (t: number) => { const d = new Date(t); return `${clock(d)}.${String(d.getMilliseconds()).padStart(3, "0")}`; };
// engine labels are built as html strings
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

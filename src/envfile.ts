import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { ENVS_DIR } from "./paths";

export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    const q = v[0];
    if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) v = v.slice(1, v.lastIndexOf(q));
    else v = v.replace(/\s+#.*$/, "").trim();
    out[m[1]] = v;
  }
  return out;
}

export function copyMissing(from: string, to: string, filter: (rel: string) => boolean, rel = ""): string[] {
  const copied: string[] = [];
  if (!existsSync(from)) return copied;
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const r = rel ? `${rel}/${f}` : f;
    const src = join(from, f);
    const dst = join(to, f);
    if (statSync(src).isDirectory()) copied.push(...copyMissing(src, dst, filter, r));
    else if (filter(r) && !existsSync(dst)) {
      copyFileSync(src, dst);
      copied.push(r);
    }
  }
  return copied;
}

export const envDir = (bundle: string) => join(ENVS_DIR, bundle);

// Copies env files cosmos needs into HOME/envs/<bundle> (never overwrites a file already there).
export async function syncEnvs(log: (m: string) => void = () => {}) {
  const { envSources } = await import("./project");
  const { A, ctx } = await import("./adapter");
  const src = envSources();
  const a = A();
  const out: Record<string, string[]> = {};
  for (const [bundle, dir] of Object.entries(src)) {
    out[bundle] = copyMissing(dir, envDir(bundle), (rel) => (a.envFilter ? a.envFilter(ctx(), bundle, rel) : true));
  }
  for (const [k, v] of Object.entries(out)) if (v.length) log(`copied ${v.length} env file(s) into envs/${k}: ${v.join(", ")}`);
  return out;
}

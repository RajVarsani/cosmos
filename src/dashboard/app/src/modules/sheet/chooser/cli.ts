import type { Form } from "@/state/ui-store";
import type { CatView } from "./catalog";

export function cliLine(f: Form, k: CatView | null, srcServices: string[] = []) {
  const parts = ["cosmos up"];
  if (f.profile) parts.push(`--profile ${f.profile}`);
  const pp = k?.profiles.find((x) => x.id === f.profile);
  if (!pp || pp.backendKind !== "local") parts.push(`--backend ${f.backend || "<backend>"}`);
  if (f.name.trim()) { const n = f.name.trim(); parts.push(`--name ${/^[a-z0-9-]+$/.test(n) ? n : JSON.stringify(n)}`); }
  for (const [svc, ref] of Object.entries(f.branches)) if (srcServices.includes(svc)) parts.push(`--branch ${svc}=${/^[\w./@-]+$/.test(ref) ? ref : JSON.stringify(ref)}`);
  if (f.live.some((svc) => srcServices.includes(svc) && f.branches[svc])) parts.push("--live");
  return parts.join(" ");
}

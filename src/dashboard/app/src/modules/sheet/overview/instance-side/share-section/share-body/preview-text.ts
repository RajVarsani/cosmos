import type { SharePreview } from "@/domain/types";
import { ago } from "@/lib/format";

export function previewText(p: SharePreview) {
  if (p.state === "ready") return `ready${p.builtAt ? `, built ${ago(p.builtAt)} ago` : ""}${p.lastMs != null ? `, last build ${(p.lastMs / 1000).toFixed(1)} s` : ""}`;
  if (p.state === "failed") return `failed${p.lastError ? `: ${p.lastError}` : ""}`;
  if (p.state === "waiting-memory") return "waiting for VM memory";
  return p.state;
}

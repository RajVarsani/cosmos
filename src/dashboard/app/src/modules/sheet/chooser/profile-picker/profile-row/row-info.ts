import type { Profile } from "@/domain/types";
import { INFRA, svcKind } from "@/domain/services";
import type { CatView } from "../../catalog";

const kindOf = (x: string) => svcKind({ service: x });

export function rowInfo(q: Profile, k: CatView) {
  const runs = (q.backends || []).filter((b) => k.combo(q.id, b).available);
  const why = runs.length ? "" : q.reason || "unavailable";
  const sv = (q.services || []).filter((x) => { const t = kindOf(x); return t === "fe" || t === "app"; });
  const fe = sv.filter((x) => kindOf(x) === "fe");
  const infra = (q.services || []).filter((x) => INFRA.has(x));
  const count = `${sv.length} ${sv.length === 1 ? "service" : "services"}${infra.length ? ` + ${infra.length} infra` : ""}`;
  const est = q.backendKind === "local" ? "all local" : `${fe.join(" + ")} local, ${sv.length > fe.length ? "rest on the backend" : "backend deployed"}`;
  const src = [["frontends", fe], ["backends", sv.filter((x) => kindOf(x) === "app")], ["infra", infra]].filter(([, l]) => l.length).map(([h, l]) => `${h}: ${(l as string[]).join(", ")}`).join(". ");
  return { enabled: runs.length > 0, why, sv, infra, count, est, src };
}

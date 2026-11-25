import { useEffect, useMemo } from "react";
import type { Profile } from "@/domain/types";
import { setUi, useUi, type Form } from "@/state/ui-store";
import { catalogView, type CatView } from "./catalog";

export type Picked = { k: CatView; p: Profile; profile: string; backend: string | null };

// the profile decides the backend: local profiles have none to pick, remote ones choose among the remotes they allow
export function pickEffective(k: CatView, f: Pick<Form, "profile" | "backend">): Picked {
  const can = (p: string, b: string | null) => !!b && k.combo(p, b).available;
  const runs = (p: Profile) => (p.backends || []).some((b) => can(p.id, b));
  const p = k.profiles.find((x) => x.id === f.profile) || k.profiles.find((x) => x.id === k.defaults.profile && runs(x)) || k.profiles.find(runs) || k.profiles[0];
  let backend = f.backend;
  if (!backend || !(p.backends || []).includes(backend) || !can(p.id, backend)) {
    const avail = (p.backends || []).filter((b) => can(p.id, b));
    backend = p.backendKind === "local" ? "local" : [k.defaults.backend, "stage"].find((b): b is string => !!b && avail.includes(b)) || avail[0] || null;
  }
  return { k, p, profile: p.id, backend };
}

export function usePickForm(): Picked | null {
  const cat = useUi((s) => s.cat);
  const profile = useUi((s) => s.form.profile);
  const backend = useUi((s) => s.form.backend);
  const pf = useMemo(() => {
    const k = catalogView(cat);
    return k && pickEffective(k, { profile, backend });
  }, [cat, profile, backend]);
  const eProfile = pf?.profile, eBackend = pf?.backend;
  useEffect(() => {
    if (eProfile === undefined) return;
    if (eProfile !== profile || eBackend !== backend) setUi((s) => ({ form: { ...s.form, profile: eProfile, backend: eBackend ?? null } }));
  }, [eProfile, eBackend, profile, backend]);
  return pf;
}

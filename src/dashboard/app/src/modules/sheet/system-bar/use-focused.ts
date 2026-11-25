import { useRef } from "react";
import type { Container, Instance, Overview } from "@/domain/types";
import { useUi } from "@/state/ui-store";

type Kept = { name: string; i: Instance; d: Overview };

// the focused instance and its planet; keeps the last one while its death plays or the sheet fades out
export function useFocused(): { i: Instance; d: Overview; pc: Container | null } | null {
  const data = useUi((s) => s.data);
  const focus = useUi((s) => s.focus);
  const planet = useUi((s) => s.planet);
  const last = useRef<Kept | null>(null);
  const live = focus && data ? data.instances.find((x) => x.name === focus) : undefined;
  if (live && data && focus) last.current = { name: focus, i: live, d: data };
  const kept = live ? last.current : !focus || last.current?.name === focus ? last.current : null;
  if (!kept) return null;
  return { i: kept.i, d: kept.d, pc: (planet && kept.i.containers.find((c) => c.service === planet)) || null };
}

import { pad2 } from "@/lib/format";
import { Button } from "@/modules/ui/button";
import { note } from "@/modules/ui/cap";
import s from "./launch-row.module.css";

export function LaunchRow({ can, reason, slot, busy }: { can: boolean; reason?: string; slot: number; busy: boolean }) {
  return (
    <div className={s.go}>
      <span className={note}>{can ? `slot ${pad2(slot)} · Enter to launch` : reason || "pick a profile and backend"}</span>
      <Button tone="pri" type="submit" disabled={!can || busy}>launch</Button>
    </div>
  );
}

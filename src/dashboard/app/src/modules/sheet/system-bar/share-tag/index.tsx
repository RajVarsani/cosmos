import { shareTone } from "@/domain/share";
import type { Share } from "@/domain/types";
import { sheetOpen } from "@/state/actions";
import s from "./share-tag.module.css";

// beside the memory figure while shared; opens the sheet where the share section lives
export function ShareTag({ sh }: { sh: Share }) {
  return <button type="button" className={s.tag} data-tone={shareTone(sh)} aria-label={`shared, ${sh.state}; show share details`} onClick={() => sheetOpen("sys")}>shared</button>;
}

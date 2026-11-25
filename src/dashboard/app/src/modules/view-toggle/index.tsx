import { cx, glass } from "@/modules/ui/glass";
import { hud } from "@/modules/top-bar";
import { Seg, type SegItem } from "@/modules/ui/seg";
import { setView } from "@/state/actions";
import { useUi, type View } from "@/state/ui-store";
import s from "./view-toggle.module.css";

const ITEMS: SegItem<View>[] = [{ k: "galaxy", label: "galaxy" }, { k: "lines", label: "lines" }];

// a standalone switch, top right: the segmented control is itself the floating glass pill; V and the palette flip it too
export function ViewToggle() {
  const view = useUi((u) => u.view);
  return <Seg items={ITEMS} value={view} onPick={setView} label="View (V)" id="viewsw" className={cx(s.sw, glass, hud)} />;
}

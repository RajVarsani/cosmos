import { sheetOpen, sheetShow } from "@/state/actions";
import { readRoute, writeRoute } from "@/state/route";
import { setUi } from "@/state/ui-store";

// the deep link decides the first frame
export function boot() {
  const r = readRoute();
  setUi({ focus: r.focus, planet: r.focus ? r.planet : null });
  if (r.logs) sheetOpen("lines"); else sheetShow(true);
  writeRoute();
}

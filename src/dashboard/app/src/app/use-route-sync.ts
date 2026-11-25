import { useEffect } from "react";
import { focusPlanet, focusSystem, sheetClose, sheetOpen } from "@/state/actions";
import { readRoute } from "@/state/route";
import { ui } from "@/state/ui-store";

// back/forward and hand-edited hashes
export function useRouteSync() {
  useEffect(() => {
    const on = () => {
      const r = readRoute(), s = ui();
      if (r.focus !== s.focus) focusSystem(r.focus);
      if ((r.planet || null) !== (ui().planet || null)) focusPlanet(r.planet);
      if (r.logs !== ui().logs) r.logs ? sheetOpen("lines") : sheetClose();
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
}

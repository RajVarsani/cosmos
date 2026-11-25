import { useEffect } from "react";
import { logsScopeTo } from "@/modules/sheet/logs/logs-store";
import { layoutUpdate } from "@/state/actions";
import { useUi } from "@/state/ui-store";

// the first poll frames the camera and picks the log sources for a deep-linked system
export function useFirstData() {
  const ready = useUi((u) => !!u.data);
  useEffect(() => {
    if (!ready) return;
    layoutUpdate(false);
    logsScopeTo();
  }, [ready]);
}

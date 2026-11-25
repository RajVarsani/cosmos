import { useEffect } from "react";
import { Cz } from "@/modules/scene/handle";
import { focusSystem } from "@/state/actions";
import { writeRoute } from "@/state/route";
import { setUi, useUi } from "@/state/ui-store";

// a focused instance that is gone lets go (unless its death is playing); a vanished planet falls back to the system
export function useFocusGuard() {
  const data = useUi((s) => s.data);
  const focus = useUi((s) => s.focus);
  const planet = useUi((s) => s.planet);
  useEffect(() => {
    if (!data || !focus) return;
    const i = data.instances.find((x) => x.name === focus);
    if (!i) {
      if (Cz.eng?.sys.get(focus)?.ghost) return;
      focusSystem(null);
      return;
    }
    if (planet && !i.containers.some((c) => c.service === planet)) {
      setUi({ planet: null });
      writeRoute();
      Cz.refocus();
    }
  }, [data, focus, planet]);
}

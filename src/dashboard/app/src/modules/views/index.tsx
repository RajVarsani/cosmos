import { useUi } from "@/state/ui-store";
import { GalaxyView } from "./galaxy-view";
import { LinesView } from "./lines-view";

// the one switch: exactly one whole view tree is mounted; setView crossfades the swap
export function Views() {
  const view = useUi((s) => s.view);
  return view === "lines" ? <LinesView /> : <GalaxyView />;
}

import { useEffect } from "react";
import { sheetPx } from "@/state/sheet-size";
import { useUi } from "@/state/ui-store";

// state the stylesheet keys off: body classes and the sheet height
export function useBodySync() {
  const logs = useUi((u) => u.logs);
  const focus = useUi((u) => !!u.focus);
  const off = useUi((u) => u.uiOff);
  const size = useUi((u) => `${u.sheetD}:${u.sheetH}`);
  useEffect(() => {
    const b = document.body.classList;
    b.toggle("logs-open", logs);
    b.toggle("sheet-on", logs || focus);
    b.toggle("sheet-bar", !logs && focus);
    b.toggle("ui-off", off);
  }, [logs, focus, off]);
  useEffect(() => { document.body.style.setProperty("--sheet-h", `${sheetPx()}px`); }, [size]);
}

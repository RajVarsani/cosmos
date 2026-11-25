import { useEffect, useRef } from "react";
import { sheetToggle } from "@/state/actions";

// a click toggles the sheet unless the pointer travelled more than 4px (a drag of the bar)
export function useBarToggle() {
  const dragged = useRef(false);
  const from = useRef<[number, number] | null>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => { from.current = [e.clientX, e.clientY]; dragged.current = false; };
    const move = (e: PointerEvent) => { const p = from.current; if (p && Math.hypot(e.clientX - p[0], e.clientY - p[1]) > 4) dragged.current = true; };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move, true); };
  }, []);
  return () => { if (!dragged.current) sheetToggle(); };
}

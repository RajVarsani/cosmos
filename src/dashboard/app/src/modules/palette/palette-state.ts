import { setUi, ui } from "@/state/ui-store";

let prev: Element | null = null;
export const paletteShown = () => ui().palOpen;
export function openPalette() { prev = document.activeElement; setUi({ palOpen: true }); }
export function closePalette(restore = true) {
  setUi({ palOpen: false });
  const p = prev as HTMLElement | null;
  if (restore && p && p.focus && document.contains(p)) p.focus({ preventScroll: true });
}

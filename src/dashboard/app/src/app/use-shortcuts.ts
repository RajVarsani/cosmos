import { useEffect } from "react";
import { Cz } from "@/modules/scene/handle";
import { closePalette, openPalette, paletteShown } from "@/modules/palette/palette-state";
import { closeDrawer, focusPlanet, focusSystem, hlSvc, openDrawer, sheetClose, sheetLogs, sheetToggle, toggleUi, toggleView } from "@/state/actions";
import { setUi, ui } from "@/state/ui-store";

// planets of the focused system in orbit order, for the arrow keys
const planetOrder = () => { const f = ui().focus, s = Cz.m && f && Cz.m.systems.find((x) => x.name === f); return s ? s.planets.map((p: { svc: string }) => p.svc) : []; };
const $ = <T extends Element = HTMLElement>(q: string) => document.querySelector<T>(q);

function onKey(e: KeyboardEvent) {
  const t = e.target as Element;
  const typing = t.closest && t.closest("input,textarea,select,[contenteditable]");
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); return paletteShown() ? closePalette() : openPalette(); }
  if (paletteShown()) return;
  const s = ui();
  if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key === "l" || e.key === "L") { e.preventDefault(); return sheetLogs(); }
    if (e.key === "n" || e.key === "N") { e.preventDefault(); return openDrawer(); }
    if (e.key === "v" || e.key === "V") { e.preventDefault(); return toggleView(); }
    if (s.drawer && e.key === "Enter" && !(t.closest && t.closest("button,a,summary"))) {
      const fm = $<HTMLFormElement>("#sh-new form"), sb = fm && fm.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (fm && sb && !sb.disabled) { e.preventDefault(); fm.requestSubmit(); }
      return;
    }
    const onBtn = t.closest && t.closest("button,a,summary,[role=separator]");
    if (s.focus && (e.key === "e" || e.key === "E" || (e.key === " " && !onBtn))) { e.preventDefault(); return sheetToggle(); }
    if (s.focus && (e.key === "o" || e.key === "O")) { const a = $<HTMLAnchorElement>('#sbar a[data-k="open"]'); if (a) { e.preventDefault(); window.open(a.href, "_blank", "noopener"); } return; }
    const onCtl = t.closest && t.closest("button,a,summary,input,[role=separator],[role=group]");
    if (s.focus && !onCtl && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const ps = planetOrder();
      if (!ps.length) return;
      e.preventDefault();
      const cur = ps.indexOf(s.planet || s.sel || ""), nx = ps[(cur + (e.key === "ArrowRight" ? 1 : -1) + ps.length) % ps.length] || ps[0];
      if (s.planet) return focusPlanet(nx);
      setUi({ sel: nx }); hlSvc(nx); return;
    }
    if (s.focus && !s.planet && !onCtl && e.key === "Enter" && s.sel && planetOrder().includes(s.sel)) { e.preventDefault(); return focusPlanet(s.sel); }
    if (s.focus && (e.key === "c" || e.key === "C")) { const bt = $<HTMLButtonElement>("#sbar [data-copyurl]"); if (bt && !bt.disabled) { e.preventDefault(); bt.click(); } return; }
    if (e.key === "\\") { e.preventDefault(); toggleUi(); return; }
    if (e.key === "/" && s.logs) { e.preventDefault(); $("#lg-q")?.focus(); return; }
  }
  if (e.key !== "Escape") return;
  if (ui().uiOff) { toggleUi(false); return; }
  if (document.activeElement === $("#lg-q")) { $("#lg-q")?.blur(); return; }
  const n = ui();
  if (n.confirm) setUi({ confirm: null });
  else if (n.logs) sheetClose();
  else if (n.drawer) closeDrawer();
  else if (n.planet) focusPlanet(null);
  else if (n.focus) focusSystem(null);
}

// one document key handler, as the old page had
export function useShortcuts() {
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

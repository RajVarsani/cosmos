import { create } from "zustand";
import type { Catalog, Overview } from "@/domain/types";

export type Tab = "sys" | "lines" | "act" | "new";
export type View = "galaxy" | "lines";
// branches: service -> ref for a new instance; a service not named stays on the project's pin
// live: services whose branch mounts the galaxy clone instead of a copy
export type Form = { profile: string | null; backend: string | null; name: string; branches: Record<string, string>; live: string[] };

export type Ui = {
  data: Overview | null;
  err: string | null;
  pollAt: number;
  pollEvery: number;
  cat: Catalog | null;
  catErr: string | null;
  catForce: number;
  focus: string | null;
  planet: string | null;
  sel: string | null;
  hoverSvc: string | null;
  confirm: string | null;
  logs: boolean;
  drawer: boolean;
  tab: Tab;
  view: View;
  uiOff: boolean;
  palOpen: boolean;
  sheetD: 0 | 1;
  sheetH: number;
  sizing: boolean;
  form: Form;
  lastError: Record<string, string>;
  open: Record<string, boolean>;
  // share or unshare calls in flight, by instance
  sharing: Record<string, "share" | "unshare">;
};

const sheetSaved = (): { d: 0 | 1; h: number } => {
  try {
    const v = JSON.parse(localStorage.getItem("cosmos-sheet") || "{}");
    return { d: v.d === 1 ? 1 : 0, h: v.h > 0 ? v.h : 0 };
  } catch {
    return { d: 0, h: 0 };
  }
};
const saved = sheetSaved();
const viewSaved = (): View => {
  try { return localStorage.getItem("cosmos-view") === "lines" ? "lines" : "galaxy"; } catch { return "galaxy"; }
};

// one store for the whole console; the scene reads it with getState() every frame
export const useUi = create<Ui>(() => ({
  data: null, err: null, pollAt: 0, pollEvery: 0,
  cat: null, catErr: null, catForce: 0,
  focus: null, planet: null, sel: null, hoverSvc: null, confirm: null,
  logs: false, drawer: false, tab: "lines", view: viewSaved(), uiOff: false, palOpen: false,
  sheetD: saved.d, sheetH: saved.h, sizing: false,
  form: { profile: null, backend: null, name: "", branches: {}, live: [] },
  lastError: {}, open: {}, sharing: {},
}));

export const ui = () => useUi.getState();
export const setUi = (p: Partial<Ui> | ((s: Ui) => Partial<Ui>)) => useUi.setState(p);
export const saveSheet = () => {
  const { sheetD: d, sheetH: h } = ui();
  try { localStorage.setItem("cosmos-sheet", JSON.stringify({ d, h })); } catch {}
};

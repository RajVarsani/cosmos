import { ui } from "./ui-store";

export const narrow = () => innerWidth <= 760;
export const det = () => (narrow() ? [0.62, 0.9] : [0.45, 0.74]);
export const sheetPx = () => { const { sheetH, sheetD } = ui(); return sheetH || Math.round(innerHeight * det()[sheetD]); };
export const barPx = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 66;
export const visiblePx = () => { const s = ui(); return s.logs ? sheetPx() : s.focus ? barPx() : 0; };

import { IconSearch } from "@/modules/ui/icons";
import { openPalette } from "@/modules/palette/palette-state";
import s from "./palette-button.module.css";

export const ibtn = s.ibtn;
const KEY = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";

export function PaletteButton() {
  return (
    <button className={s.ibtn} type="button" id="palbtn" aria-keyshortcuts="Meta+K Control+K" aria-haspopup="dialog" onClick={openPalette}>
      <IconSearch /><span className={s.t}>commands</span><kbd id="palkey">{KEY}</kbd>
    </button>
  );
}

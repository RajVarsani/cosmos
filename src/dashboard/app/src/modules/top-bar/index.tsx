import { cx, glass } from "@/modules/ui/glass";
import { Crumb } from "./crumb";
import { LifeChip } from "./life-chip";
import { MemoryRing } from "./memory-ring";
import { PaletteButton } from "./palette-button";
import { Pulse } from "./pulse";
import { Wordmark } from "./wordmark";
import s from "./top-bar.module.css";

export const hud = s.hud;
export const vsep = s.vsep;

export function TopBar() {
  return (
    <header className={cx(s.bar, glass, s.hud)} id="bar">
      <Wordmark />
      <Crumb />
      <span className={s.vsep} />
      <Pulse />
      <LifeChip />
      <MemoryRing />
      <span className={s.vsep} />
      <PaletteButton />
    </header>
  );
}

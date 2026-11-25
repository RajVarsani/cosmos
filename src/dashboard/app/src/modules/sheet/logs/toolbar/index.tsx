import { Volume } from "../volume";
import { Filter } from "./filter";
import { LevelSeg } from "./level-seg";
import { SelectedPills } from "./selected-pills";
import { Toggles } from "./toggles";
import s from "./toolbar.module.css";

export function Toolbar() {
  return (
    <div className={s.top2}>
      <SelectedPills />
      <div className={s.tools}>
        <LevelSeg />
        <Filter />
        <Toggles />
      </div>
      <Volume />
    </div>
  );
}

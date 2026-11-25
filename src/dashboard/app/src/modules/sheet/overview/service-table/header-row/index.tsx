import { cx } from "@/modules/ui/glass";
import grid from "../row-grid.module.css";
import s from "./header-row.module.css";

export function HeaderRow() {
  return (
    <div className={cx(grid.cols, s.hd)}>
      <span>service</span><span>port</span><span>memory</span><span>cpu</span><span>check</span><span>up</span><span>restarts</span><span></span>
    </div>
  );
}

import { cx } from "@/modules/ui/glass";
import { hud } from "@/modules/top-bar";
import { Legend } from "./legend";
import { LogsButton } from "./logs-button";
import s from "./dock.module.css";

export function Dock() {
  return (
    <div className={cx(s.dock, hud)} id="dock">
      <Legend />
      <LogsButton />
    </div>
  );
}

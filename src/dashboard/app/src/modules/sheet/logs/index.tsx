import { Activity } from "../activity";
import { Lines } from "./lines";
import { Jump } from "./lines/jump";
import { SourceRail } from "./source-rail";
import { Toolbar } from "./toolbar";
import s from "./logs.module.css";

export function LogsBody() {
  return (
    <div className={s.root}>
      <SourceRail />
      <div className={s.main}>
        <Toolbar />
        <Lines />
        <Jump />
      </div>
      <Activity />
    </div>
  );
}

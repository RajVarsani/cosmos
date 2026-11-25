import { ActTabCount } from "../activity/tab-count";
import { LiveStatus } from "../logs/live-status";
import { ScopeChip } from "../logs/scope-chip";
import { CloseButton } from "./close-button";
import { NewTitle } from "./new-title";
import { SizeButton } from "./size-button";
import { Tabs } from "./tabs";
import s from "./header.module.css";

export function SheetHeader() {
  return (
    <div className={s.head}>
      <Tabs actCount={<ActTabCount />} />
      <ScopeChip />
      <LiveStatus />
      <NewTitle />
      <span className={s.sp} />
      <SizeButton className={s.size} />
      <CloseButton />
    </div>
  );
}

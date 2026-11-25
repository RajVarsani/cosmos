import type { ReactNode } from "react";
import { logsSync } from "../../logs/logs-store";
import { Seg } from "@/modules/ui/seg";
import { sheetTab } from "@/state/actions";
import { useUi, type Tab } from "@/state/ui-store";
import s from "./tabs.module.css";

export function Tabs({ actCount }: { actCount: ReactNode }) {
  const tab = useUi((u) => u.tab);
  return (
    <Seg<Tab>
      label="show" className={s.tabs} value={tab}
      items={[
        { k: "sys", label: "overview", className: s.sys },
        { k: "lines", label: "logs" },
        { k: "act", label: <>activity{actCount}</>, className: s.act },
      ]}
      onPick={(t) => { sheetTab(t); logsSync(); }}
    />
  );
}

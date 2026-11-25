import { Seg } from "@/modules/ui/seg";
import { logsSetLevel, useLogs, type Level } from "../../logs-store";

export function LevelSeg() {
  const level = useLogs((l) => l.level);
  const c = useLogs((l) => l.counts);
  return (
    <Seg<Level>
      label="level"
      value={level}
      onPick={logsSetLevel}
      items={[{ k: "all", label: "all", count: c.all }, { k: "warn", label: "warn+", count: c.warn + c.error, tone: "warn" }, { k: "error", label: "errors", count: c.error, tone: "error" }]}
    />
  );
}

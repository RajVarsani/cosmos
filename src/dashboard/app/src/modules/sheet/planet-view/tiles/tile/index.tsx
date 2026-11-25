import { Spark } from "@/modules/ui/spark";
import { cx } from "@/modules/ui/glass";
import s from "./tile.module.css";

const TONE: Record<string, string> = { ok: s.ok, bad: s.bad, go: s.go, hot: s.hot };

// a label, a value, an optional sub line; the wide one carries the memory trail
export function Tile({ label, value, sub, tone, spark }: { label: string; value: string; sub?: string; tone?: string; spark?: number[] }) {
  return (
    <div className={cx(s.pt, !!spark && s.wide, tone && TONE[tone])}>
      <span>{label}</span>
      <b>{value}</b>
      {spark && <div className={s.spk}><Spark h={spark} /></div>}
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

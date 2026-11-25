import { memo, type CSSProperties } from "react";
import { clockMs } from "@/lib/format";
import { cx } from "@/modules/ui/glass";
import type { Line } from "../../logs-store";
import s from "./line-row.module.css";

const LV: Record<string, string> = { error: s.lvError, warn: s.lvWarn, sys: s.lvSys };

function Marked({ text, q }: { text: string; q: string }) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, k) => (k % 2 ? <mark key={k}>{p}</mark> : p));
}

export const LineRow = memo(function LineRow({ x, q, tag, color }: { x: Line; q: string; tag: string; color: string }) {
  return (
    <div className={cx(s.ln, LV[x.lv])}>
      <span className={s.ts}>{clockMs(x.t)}</span>
      <span className={s.tag} style={{ "--c": color } as CSSProperties}>{tag}</span>
      <span className={s.tx}><Marked text={x.text} q={q} /></span>
    </div>
  );
});

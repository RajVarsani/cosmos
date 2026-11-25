import { memo, type CSSProperties } from "react";
import { svcHealth } from "@/domain/services";
import type { Container, Instance } from "@/domain/types";
import { cx } from "@/modules/ui/glass";
import { logsToggle, useLogs } from "../../logs-store";
import { colorOf } from "../../src-color";
import s from "./source-row.module.css";

export const SourceRow = memo(function SourceRow({ i, c }: { i: Instance; c: Container }) {
  const k = `${i.name}/${c.service}`, h = svcHealth(c, i);
  const picked = useLogs((l) => l.sel.includes(k));
  const color = useLogs((l) => colorOf(l.sel, k));
  const n = useLogs((l) => l.errBy[k] || 0);
  return (
    <button type="button" className={s.src} aria-pressed={picked} disabled={!c.container} title={h.text} style={{ "--c": color } as CSSProperties} onClick={() => logsToggle(k)}>
      <span className={s.bx} /><span className={s.nm}>{c.service}</span>{n > 0 && <span className={s.ec}>{n}</span>}<span className={cx(s.hd, h.cls === "ok" && s.ok)} />
    </button>
  );
});

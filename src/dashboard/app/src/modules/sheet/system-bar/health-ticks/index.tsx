import { Fragment } from "react";
import { svcHealth, svcList } from "@/domain/services";
import type { Instance } from "@/domain/types";
import { cx } from "@/modules/ui/glass";
import { useUi } from "@/state/ui-store";
import s from "./health-ticks.module.css";

const TONE: Record<string, string> = { ok: s.ok, go: s.go, bad: s.bad };

// one tick per service, a gap between bands; hover is wired by the sheet frame through data-tick
export function HealthTicks({ i }: { i: Instance }) {
  const hover = useUi((u) => u.hoverSvc);
  return (
    <div className={s.hp} aria-label="service health">
      {svcList(i).map(([k, , list], n) => (
        <Fragment key={k}>
          {n > 0 && <i className={s.gap} />}
          {list.map((c) => {
            const h = svcHealth(c, i);
            return <i key={c.service} className={cx(TONE[h.cls], hover === c.service && s.hl)} data-tick={c.service} title={`${c.service} · ${h.text}`} />;
          })}
        </Fragment>
      ))}
    </div>
  );
}

import { lifeLine, lifeOf } from "@/domain/life";
import { lbl } from "@/domain/states";
import { focusSystem } from "@/state/actions";
import { useUi } from "@/state/ui-store";
import { cx } from "@/modules/ui/glass";
import s from "./life-chip.module.css";

// the system being created or destroyed, with its current step
export function LifeChip() {
  const d = useUi((u) => u.data);
  const lives = d ? d.instances.map((x) => [x, lifeOf(x, d)] as const).filter(([, L]) => L) : [];
  if (!lives.length) return <button type="button" className={s.chip} id="lifechip" hidden />;
  const [x, L] = lives.find(([, L]) => !L!.failed) || lives[0], ln = lifeLine(L)!;
  return (
    <button type="button" className={cx(s.chip, ln.cls === "bad" && s.bad)} id="lifechip" data-focus={x.name} title={`${ln.word} ${lbl(x)}: ${ln.detail}`} onClick={() => focusSystem(x.name)}>
      <i /><em>{ln.word}</em> {lbl(x)}<span>· {ln.detail}</span>{lives.length > 1 && <span>· +{lives.length - 1} more</span>}
    </button>
  );
}

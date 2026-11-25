import { lifeLine, lifeOf } from "@/domain/life";
import { LABEL, lbl, stCls } from "@/domain/states";
import type { Instance, Overview } from "@/domain/types";
import { mib, pad2 } from "@/lib/format";
import { useUi } from "@/state/ui-store";
import { BarActions } from "../bar-actions";
import { BarMem } from "../bar-mem";
import { HealthTicks } from "../health-ticks";
import { ShareTag } from "../share-tag";
import { SystemId } from "../system-id";
import { MetaEm } from "../system-id/meta-em";

export function SystemLine({ i, d }: { i: Instance; d: Overview }) {
  const err = useUi((u) => u.lastError[i.name]);
  const ln = lifeLine(lifeOf(i, d));
  const mem = i.containers.reduce((a, c) => a + (c.running ? c.memMiB || 0 : 0), 0);
  return (
    <>
      <SystemId cls={stCls(i.state)} dotTitle={LABEL[i.state] || i.state} name={lbl(i)}>
        {`${lbl(i) !== i.name ? `${i.name} · ` : ""}${i.backend}${i.profile ? ` · ${i.profile}` : ""} · slot ${pad2(i.slot)}`}
        {ln ? <> · <MetaEm err={ln.cls === "bad"}>{`${ln.word} · ${ln.detail}`}</MetaEm></> : err ? <> · <MetaEm err>{err}</MetaEm></> : null}
      </SystemId>
      <HealthTicks i={i} />
      <BarMem title="memory in use" aside={i.share && <ShareTag sh={i.share} />}>{mib(mem)}</BarMem>
      <BarActions i={i} />
    </>
  );
}

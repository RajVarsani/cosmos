import type { CSSProperties } from "react";
import { bk } from "@/domain/palette";
import { runCount, svcKind } from "@/domain/services";
import { lbl, stCls } from "@/domain/states";
import type { Instance } from "@/domain/types";
import { setLogs, useLogs } from "../../logs-store";
import { Band } from "../band";
import { SourceRow } from "../source-row";
import s from "./instance-group.module.css";

const BANDS = [["fe", "frontends", ["fe"]], ["app", "backends", ["app"]], ["infra", "infra", ["infra", "init"]]] as const;

export function InstanceGroup({ i, scoped }: { i: Instance; scoped: boolean }) {
  const any = useLogs((l) => i.containers.some((c) => l.sel.includes(`${i.name}/${c.service}`)));
  const ov = useLogs((l) => l.openInst[i.name]);
  const open = ov !== undefined ? ov : scoped || any || i.state !== "stopped";
  const run = runCount(i);
  const bands = BANDS.map(([k, t, kinds]) => [k, t, i.containers.filter((c) => (kinds as readonly string[]).includes(svcKind(c)))] as const).filter((b) => b[2].length);
  return (
    <div className={s.rg}>
      <button type="button" className={s.head} style={{ "--c": bk(i.backend).c } as CSSProperties} aria-expanded={open} onClick={() => setLogs({ openInst: { ...useLogs.getState().openInst, [i.name]: !open } })}>
        <i className={stCls(i.state)} /><b>{lbl(i)}</b><span className={s.bk}>{i.backend}</span><span className={s.n}>{run.up}/{run.of}</span>
      </button>
      {open && (
        <div className={s.body}>
          {bands.length === 1
            ? bands[0][2].map((c) => <SourceRow key={c.service} i={i} c={c} />)
            : bands.map(([k, t, list]) => <Band key={k} i={i} k={k} title={t} list={list} />)}
        </div>
      )}
    </div>
  );
}

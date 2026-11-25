import { Fragment } from "react";
import { upCmd } from "@/domain/services";
import type { Instance, Overview } from "@/domain/types";
import { ago } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { Cap } from "@/modules/ui/cap";
import { CliLine } from "@/modules/ui/cli-line";
import { JobLine } from "@/modules/ui/job-line";
import { Kvs } from "@/modules/ui/kvs";
import { More } from "@/modules/ui/more";
import { useUi } from "@/state/ui-store";
import { ShareSection } from "./share-section";
import { SourceList } from "./source-list";
import s from "./instance-side.module.css";

// who made the instance, where it runs from, and the command that recreates it
export function InstanceSide({ i, d }: { i: Instance; d: Overview }) {
  useNow(1000);
  const err = useUi((u) => u.lastError[i.name]);
  const o = i.owner || {}, login = i.login || d.login;
  const imgs = Object.entries(i.images || {}).filter(([, v]) => typeof v === "string" && v);
  return (
    <aside className={s.side}>
      {i.job ? <JobLine className={s.flush}>{i.job.last || i.job.kind}</JobLine> : err ? <JobLine tone="err" className={s.flush}>{err}</JobLine> : null}
      {[...(i.warnings || []), i.corsWarning].filter((w): w is string => !!w).map((w) => <JobLine key={w} tone="warn" className={s.flush}>{w}</JobLine>)}
      <Cap className={s.tuck}>Instance</Cap>
      <Kvs className={s.flush}>
        <dt>created</dt><dd><span>{ago(i.createdAt)}</span> ago</dd>
        <dt>used</dt><dd><span>{ago(i.lastUsed)}</span> ago</dd>
        <dt>owner</dt><dd>{o.via === "dashboard" ? "console" : o.sessionId ? `session ${o.sessionId.slice(0, 8)}` : "cli"}{o.pid ? ` · pid ${o.pid}` : ""}</dd>
        {login && <><dt>login</dt><dd>{typeof login === "string" ? login : login.email || ""}</dd></>}
        {i.image && <><dt>image</dt><dd>{i.image}</dd></>}
      </Kvs>
      <ShareSection i={i} />
      <SourceList i={i} />
      <CliLine text={upCmd(i)} />
      {imgs.length > 0 && (
        <More k={`imgs:${i.name}`} summary={`images · ${imgs.length}`}>
          <Kvs className={s.flush}>
            {imgs.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v.replace(/^cosmos-/, "")}</dd></Fragment>)}
          </Kvs>
        </More>
      )}
    </aside>
  );
}

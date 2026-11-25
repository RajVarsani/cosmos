import { Fragment } from "react";
import { svcUrl } from "@/domain/services";
import type { Container, Instance } from "@/domain/types";
import { mib } from "@/lib/format";
import { Kvs } from "@/modules/ui/kvs";
import { hist } from "@/state/hist";
import { gitText } from "../../overview/instance-side/git-text";
import s from "./details.module.css";

export function Details({ i, c }: { i: Instance; c: Container }) {
  const url = svcUrl(c), h = hist.get(`${i.name}/${c.service}`) || [], peak = Math.max(0, ...h);
  const edge = (i.edge || []).filter((e) => (e.keys || []).some((x) => x.startsWith(`${c.service}:`)));
  const workers = (i.workers && i.workers[c.service]) || [];
  const g = i.git && i.git[c.service], img = (i.images && i.images[c.service]) || (c.service === i.mainService ? i.image : "");
  return (
    <Kvs className={s.kv}>
      <dt>container</dt><dd>{c.container || "—"}</dd>
      {url && <><dt>url</dt><dd>{/^https?:/.test(url) && c.running ? <a href={url} target="_blank" rel="noopener">{url}</a> : url}</dd></>}
      {img && <><dt>image</dt><dd>{img}</dd></>}
      {g && <><dt>git</dt><dd>{gitText(g)}</dd></>}
      {edge.map((e) => (
        <Fragment key={`${e.port}:${e.upstream}`}>
          <dt>via edge :{e.port}</dt>
          <dd>{e.upstream}<br /><span className={s.k}>{(e.keys || []).filter((x) => x.startsWith(`${c.service}:`)).map((x) => x.split(":")[1]).join(", ")}</span></dd>
        </Fragment>
      ))}
      {workers.length > 0 && (
        <><dt>processes</dt><dd>{workers.map((w, n) => <Fragment key={w.name}>{n > 0 && " · "}<span className={w.alive ? s.ok : s.bad}>{w.name}{w.count > 1 ? ` ×${w.count}` : ""}</span></Fragment>)}</dd></>
      )}
      {peak > 0 && <><dt>memory peak</dt><dd>{mib(peak)} over the last {h.length} polls</dd></>}
    </Kvs>
  );
}

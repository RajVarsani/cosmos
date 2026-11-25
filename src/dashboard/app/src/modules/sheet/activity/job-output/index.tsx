import { Fragment, useLayoutEffect, useRef } from "react";
import { useActivity } from "../activity-store";
import s from "./job-output.module.css";

export function JobOutput({ id }: { id: string }) {
  const lines = useActivity((a) => a.lines[id]);
  const live = useActivity((a) => a.esId === id);
  const ref = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => { if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines, live]);
  const ls = (lines || []).slice(-80);
  if (!ls.length) return <pre className={s.out}>loading…</pre>;
  return (
    <pre ref={ref} className={s.out}>
      {ls.map((l, k) => <Fragment key={k}>{k > 0 && "\n"}<span className={s[l.kind]}>{l.text}</span></Fragment>)}
    </pre>
  );
}

import type { Instance } from "@/domain/types";
import { Cap } from "@/modules/ui/cap";
import { SourceRow } from "./source-row";
import { useSources } from "./use-sources";
import s from "./source-list.module.css";

// each source-mounted service's worktree, with a branch switcher per row
export function SourceList({ i }: { i: Instance }) {
  const { data, error } = useSources(i.name, i.job?.id ?? null);
  const rows = data?.sources ?? [];
  if (!rows.length && !error) return null;
  return (
    <section className={s.list} aria-label="source">
      <Cap className={s.cap} n={rows.length || undefined}>Source</Cap>
      {error && !rows.length ? <p className={s.err}>{error.message}</p> : rows.map((r) => <SourceRow key={r.svc} name={i.name} r={r} busy={!!i.job} />)}
    </section>
  );
}

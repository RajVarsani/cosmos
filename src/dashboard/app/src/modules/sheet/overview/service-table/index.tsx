import { svcList } from "@/domain/services";
import type { Instance } from "@/domain/types";
import { useNow } from "@/lib/use-now";
import { Group } from "./group";
import { HeaderRow } from "./header-row";
import s from "./service-table.module.css";

export function ServiceTable({ i }: { i: Instance }) {
  useNow(1000);
  return (
    <div className={s.svcs}>
      <HeaderRow />
      {svcList(i).map(([k, t, list]) => <Group key={k} i={i} title={t} list={list} />)}
    </div>
  );
}

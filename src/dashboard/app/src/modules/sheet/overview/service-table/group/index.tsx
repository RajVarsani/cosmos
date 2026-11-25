import { svcHealth } from "@/domain/services";
import type { Container, Instance } from "@/domain/types";
import { ServiceRow } from "../service-row";
import s from "./group.module.css";

// a band of services under its title and how many are ok
export function Group({ i, title, list }: { i: Instance; title: string; list: Container[] }) {
  const ok = list.filter((c) => svcHealth(c, i).cls === "ok").length;
  return (
    <>
      <div className={s.g}>{title[0].toUpperCase() + title.slice(1)}<span className={s.n}>{ok}/{list.length} ok</span></div>
      {list.map((c) => <ServiceRow key={c.service} i={i} c={c} />)}
    </>
  );
}

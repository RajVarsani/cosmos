import type { CSSProperties } from "react";
import { svcC } from "@/domain/palette";
import type { Container, Instance } from "@/domain/types";
import { Details } from "./details";
import { Tail } from "./tail";
import { Tiles } from "./tiles";
import s from "./planet-view.module.css";

// one service up close: vitals, facts and its live log tail
export function PlanetView({ i, c }: { i: Instance; c: Container }) {
  return (
    <div className={s.pv} style={{ "--pc": svcC(c.service) } as CSSProperties}>
      <div className={s.main}>
        <Tiles i={i} c={c} />
        <Details i={i} c={c} />
      </div>
      <Tail k={`${i.name}/${c.service}`} />
    </div>
  );
}

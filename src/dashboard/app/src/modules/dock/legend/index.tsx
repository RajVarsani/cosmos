import type { CSSProperties } from "react";
import s from "./legend.module.css";

const K = (v: string) => ({ "--k": `var(${v})` }) as CSSProperties;

export function Legend() {
  return (
    <div className={s.legend} aria-hidden="true">
      <span style={K("--legend-fe")}>frontends</span><span style={K("--legend-be")}>backends</span><span style={K("--legend-infra")}>infra belt</span>
    </div>
  );
}

import type { ReactNode } from "react";
import s from "./bar-mem.module.css";

export function BarMem({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return <span className={s.mem}><span title={title}>{children}</span>{aside}</span>;
}

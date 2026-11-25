import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/modules/ui/glass";
import s from "./meta-em.module.css";

export function MetaEm({ err, style, children }: { err?: boolean; style?: CSSProperties; children: ReactNode }) {
  return <em className={cx(s.em, err && s.err)} style={style}>{children}</em>;
}

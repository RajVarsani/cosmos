import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../glass";
import s from "./cap.module.css";

// a small uppercase caption, with an optional count pushed right
export function Cap({ n, className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { n?: ReactNode }) {
  return <div className={cx(s.cap, className)} {...rest}>{children}{n != null && <span className={s.n}>{n}</span>}</div>;
}
export const capN = s.n;
export const note = s.note;

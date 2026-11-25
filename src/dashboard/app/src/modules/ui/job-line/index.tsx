import type { ReactNode } from "react";
import { cx } from "../glass";
import s from "./job-line.module.css";

export function JobLine({ tone, className, children }: { tone?: "err" | "warn"; className?: string; children: ReactNode }) {
  return <div className={cx(s.jobline, tone && s[tone], className)}>{children}</div>;
}

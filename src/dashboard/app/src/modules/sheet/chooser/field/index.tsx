import type { ReactNode } from "react";
import { cx } from "@/modules/ui/glass";
import s from "./field.module.css";

// a labelled form field; step numbers the label
export function Field({ step, label, className, children }: { step?: number; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx(s.fld, className)}>
      <label>{step != null && <span className={s.step}>{step}</span>}{label}</label>
      {children}
    </div>
  );
}

import type { ButtonHTMLAttributes } from "react";
import { cx } from "../glass";
import s from "./chip.module.css";

export const chipClass = s.chip;

export function Chip({ className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx(s.chip, className)} {...rest} />;
}

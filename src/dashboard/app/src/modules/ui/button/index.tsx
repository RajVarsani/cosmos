import type { ButtonHTMLAttributes } from "react";
import { cx } from "../glass";
import s from "./button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "pri" | "dan" | "solid" };

export function Button({ tone, className, type = "button", ...rest }: Props) {
  return <button type={type} className={cx(s.btn, tone === "pri" && s.pri, tone && tone !== "pri" && s.dan, tone === "solid" && s.solid, className)} {...rest} />;
}

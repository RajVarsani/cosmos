import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../glass";
import s from "./icon-button.module.css";

export const ibClass = (dan?: boolean, className?: string) => cx(s.ib, dan && s.dan, className);

export function IconButton({ dan, className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { dan?: boolean }) {
  return <button type={type} className={ibClass(dan, className)} {...rest} />;
}

// an open link when there is somewhere to go, else the same glyph, inert
export function IconLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) {
  if (!href) return <span className={s.ib} aria-disabled="true">{children}</span>;
  return <a className={s.ib} href={href} target="_blank" rel="noopener" {...rest}>{children}</a>;
}

import type { HTMLAttributes } from "react";
import { cx } from "../glass";
import s from "./kvs.module.css";

export function Kvs({ className, ...rest }: HTMLAttributes<HTMLDListElement>) {
  return <dl className={cx(s.kvs, className)} {...rest} />;
}

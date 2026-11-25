import type { InputHTMLAttributes } from "react";
import s from "./text-input.module.css";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={s.txt} spellCheck={false} {...props} />;
}

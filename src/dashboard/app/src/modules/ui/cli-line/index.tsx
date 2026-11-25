import { copy } from "@/state/actions";
import s from "./cli-line.module.css";

// a shell line with a copy button
export function CliLine({ text }: { text: string }) {
  return (
    <div className={s.cli}>
      <span className={s.p}>$</span>
      <code>{text}</code>
      <button type="button" onClick={() => copy(text)}>copy</button>
    </div>
  );
}

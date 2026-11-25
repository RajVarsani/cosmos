import { motion } from "motion/react";
import { T } from "@/lib/motion/spec";
import s from "./password-switch.module.css";

// the share's password gate
export function PasswordSwitch({ on, busy, onFlip }: { on: boolean; busy?: boolean; onFlip: (next: boolean) => void }) {
  return (
    <div className={s.row}>
      <span>password</span>
      <em>{on ? "on" : "off · anyone with the link"}</em>
      <button type="button" role="switch" className={s.sw} aria-checked={on} aria-label="password" aria-busy={busy || undefined} disabled={busy} onClick={() => onFlip(!on)}>
        <motion.i initial={false} animate={{ x: on ? 12 : 0 }} transition={T.base} />
      </button>
    </div>
  );
}

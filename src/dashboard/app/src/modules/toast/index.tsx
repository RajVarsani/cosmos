import { AnimatePresence, motion } from "motion/react";
import { T, rise } from "@/lib/motion/spec";
import { cx } from "@/modules/ui/glass";
import { useToast } from "./toast-store";
import s from "./toast.module.css";

export function Toast() {
  const t = useToast((x) => x.t);
  return (
    <AnimatePresence>
      {t && (
        <motion.div className={cx(s.toast, t.err && s.err)} id="toast" role="status" style={{ x: "-50%" }} {...rise} transition={T.panel}>
          {t.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import type { Instance } from "@/domain/types";
import { Cap } from "@/modules/ui/cap";
import { ShareBody } from "./share-body";
import s from "./share-section.module.css";

// opt-in zrok share in the side column, between INSTANCE and SOURCE
export function ShareSection({ i }: { i: Instance }) {
  return (
    <section className={s.list} aria-label="share">
      <Cap className={s.cap}>Share</Cap>
      <ShareBody i={i} />
    </section>
  );
}

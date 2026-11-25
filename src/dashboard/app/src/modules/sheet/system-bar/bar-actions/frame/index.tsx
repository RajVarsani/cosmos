import type { ReactNode } from "react";
import { IconButton } from "@/modules/ui/icon-button";
import { IconX } from "@/modules/ui/icons";
import { ExpandButton } from "../../expand-button";
import s from "./frame.module.css";

// the bar's right edge: the caller's buttons, a divider, expand, and the way back
export function ActsFrame({ lead, back }: { lead: ReactNode; back: { title: string; label: string; onClick: () => void } }) {
  return (
    <div className={s.acts}>
      {lead}
      <span className={s.vsep} />
      <ExpandButton />
      <IconButton title={back.title} aria-label={back.label} onClick={back.onClick}><IconX /></IconButton>
    </div>
  );
}

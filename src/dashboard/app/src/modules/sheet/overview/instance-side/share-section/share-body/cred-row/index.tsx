import { useState } from "react";
import { IconCopy, IconEye, IconOpen } from "@/modules/ui/icons";
import { IconButton, IconLink } from "@/modules/ui/icon-button";
import { copy } from "@/state/actions";
import s from "./cred-row.module.css";

// a value with copy; a link also opens, a secret stays masked until revealed
export function CredRow({ k, v, href, secret }: { k: string; v: string; href?: string; secret?: boolean }) {
  const [shown, setShown] = useState(false);
  const masked = secret && !shown;
  return (
    <div className={s.row}>
      <span>{k}</span>
      <b title={masked ? undefined : v} data-masked={masked || undefined}>{masked ? "••••••••••" : v}</b>
      {href ? <IconLink href={href} rel="noreferrer" aria-label={`open ${k}`}><IconOpen /></IconLink>
        : secret ? <IconButton aria-pressed={shown} aria-label={shown ? `hide ${k}` : `reveal ${k}`} onClick={() => setShown((x) => !x)}><IconEye /></IconButton>
        : <i />}
      <IconButton aria-label={`copy ${k}`} onClick={() => copy(v, `${k} copied`)}><IconCopy /></IconButton>
    </div>
  );
}

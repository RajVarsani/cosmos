import { lbl } from "@/domain/states";
import type { Instance } from "@/domain/types";
import { Button } from "@/modules/ui/button";
import { act } from "@/state/actions";
import s from "./confirm-remove.module.css";

export function ConfirmRemove({ i }: { i: Instance }) {
  return (
    <span className={s.confirm} role="alertdialog" aria-label="confirm remove">
      remove <b>{lbl(i)}</b>?
      <Button data-act="keep" onClick={() => act("keep", i.name)}>keep</Button>
      <Button tone="solid" data-act="remove" onClick={() => act("remove", i.name)}>remove</Button>
    </span>
  );
}

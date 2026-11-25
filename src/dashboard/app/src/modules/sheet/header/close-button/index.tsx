import { ibtn } from "@/modules/top-bar/palette-button";
import { cx } from "@/modules/ui/glass";
import { IconDown, IconX } from "@/modules/ui/icons";
import { sheetClose } from "@/state/actions";
import { useUi } from "@/state/ui-store";
import s from "./close-button.module.css";

export function CloseButton() {
  const focus = useUi((u) => !!u.focus);
  return (
    <button className={cx(ibtn, s.x)} type="button" id="sh-x" aria-label={focus ? "collapse" : "close logs"} onClick={sheetClose}>
      {focus ? <IconDown /> : <IconX />}
    </button>
  );
}

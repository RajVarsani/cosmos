import { IconUp } from "@/modules/ui/icons";
import { IconButton } from "@/modules/ui/icon-button";
import { sheetToggle } from "@/state/actions";
import { useUi } from "@/state/ui-store";
import s from "./expand-button.module.css";

export function ExpandButton() {
  const logs = useUi((u) => u.logs);
  return (
    <IconButton className={s.exp} id="sb-exp" aria-controls="sheet" aria-expanded={logs} aria-label={logs ? "collapse" : "expand"} onClick={sheetToggle}>
      <IconUp />
      <kbd>E</kbd>
    </IconButton>
  );
}

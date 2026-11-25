import { IconLogs } from "@/modules/ui/icons";
import { cx, glass } from "@/modules/ui/glass";
import { sheetLogs } from "@/state/actions";
import { useUi } from "@/state/ui-store";
import s from "./logs-button.module.css";

export function LogsButton() {
  const logs = useUi((u) => u.logs);
  return (
    <button className={cx(s.btn, glass)} type="button" id="logbtn" aria-controls="sheet" aria-expanded={logs} aria-keyshortcuts="L" onClick={sheetLogs}>
      <IconLogs />logs<kbd>L</kbd>
    </button>
  );
}

import { useState } from "react";
import { useUi } from "@/state/ui-store";
import { LaunchForm } from "./launch-form";
import s from "./chooser.module.css";

// the form persists between opens, so it renders once the drawer has been opened
export function Chooser() {
  const drawer = useUi((st) => st.drawer);
  const hasData = useUi((st) => !!st.data);
  const [seen, setSeen] = useState(false);
  if (drawer && !seen) setSeen(true);
  return (
    <div id="sh-new" className={s.root}>
      {(drawer || seen) && hasData && <LaunchForm />}
    </div>
  );
}

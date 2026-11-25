import { ibtn } from "@/modules/top-bar/palette-button";
import { cx } from "@/modules/ui/glass";
import { IconUp } from "@/modules/ui/icons";
import { sheetSize } from "@/state/actions";
import { useUi } from "@/state/ui-store";

export function SizeButton({ className }: { className?: string }) {
  const d = useUi((u) => u.sheetD);
  return (
    <button className={cx(ibtn, className)} type="button" id="sh-size" aria-label={d ? "shorter" : "taller"} onClick={sheetSize}>
      <IconUp style={d ? { transform: "rotate(180deg)" } : undefined} />
    </button>
  );
}

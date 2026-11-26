/** @jsxRuntime automatic @jsxImportSource react */
import { Text } from "ink";
import type { Row } from "../../data/types";
import { C, shareColor, stateColor, stateLabel } from "../../theme/palette";
import { fit, mem } from "../../lib/text";
import { COL_GAP, type Cols } from "../columns";

type Props = { row: Row; cols: Cols; selected: boolean; pending?: string; width: number };

const PENDING: Record<string, string> = { down: "stopping", share: "sharing", unshare: "unsharing" };
const gap = " ".repeat(COL_GAP);

export function ListRow({ row, cols, selected, pending, width }: Props) {
  const state = pending ? PENDING[pending] : row.state;
  const color = pending ? C.yel : stateColor(row.state);
  const bg = selected ? C.sel : undefined;
  const name = fit(row.label, cols.name);
  const mid = ([[cols.slot, String(row.slot), "right"], [cols.profile, row.profile, "left"], [cols.backend, row.backend, "left"]] as const)
    .filter(([w]) => w > 0)
    .map(([w, s, a]) => gap + fit(s, w, a))
    .join("");
  const used = 2 + name.length + mid.length + COL_GAP + cols.status + COL_GAP + cols.mem + (cols.share ? COL_GAP + cols.share : 0) + (cols.url ? COL_GAP + cols.url : 0);
  return (
    <Text backgroundColor={bg} wrap="truncate">
      <Text color={selected ? C.tx : C.tx3}>{selected ? "› " : "  "}</Text>
      <Text color={selected ? C.tx : C.tx2} bold={selected}>{name}</Text>
      <Text color={C.tx3}>{mid}{gap}</Text>
      <Text color={color}>{fit(`● ${stateLabel(state)}`, cols.status)}</Text>
      <Text color={C.tx2}>{gap}{fit(mem(row.memMiB), cols.mem, "right")}</Text>
      {cols.share > 0 && <Text color={row.share ? shareColor(row.share.state) : C.tx3}>{gap}{fit(row.share ? "share" : "", cols.share)}</Text>}
      {cols.url > 0 && <Text color={C.cyan}>{gap}{fit(row.url, cols.url)}</Text>}
      <Text>{" ".repeat(Math.max(0, width - used))}</Text>
    </Text>
  );
}

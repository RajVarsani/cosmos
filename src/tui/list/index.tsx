/** @jsxRuntime automatic @jsxImportSource react */
import { Box, Text } from "ink";
import type { Row } from "../data/types";
import { C } from "../theme/palette";
import { fit } from "../lib/text";
import { COL_GAP, layout } from "./columns";
import { ListRow } from "./row";

type Props = { rows: Row[]; selected: number; width: number; height: number; pending: Record<string, string>; filtered: boolean };

const gap = " ".repeat(COL_GAP);

export function ListView({ rows, selected, width, height, pending, filtered }: Props) {
  if (!rows.length) {
    return (
      <Box height={height} flexDirection="column" justifyContent="center" alignItems="center">
        <Text color={C.tx2}>{filtered ? "no instance matches the filter" : "no instances"}</Text>
        <Text color={C.tx3}>{filtered ? "esc clears it" : "start one with cosmos up --backend <b> --name \"My Work\""}</Text>
      </Box>
    );
  }
  const cols = layout(rows, width);
  const room = Math.max(1, height - 1);
  const start = Math.min(Math.max(0, selected - room + 1), Math.max(0, rows.length - room), selected);
  const head = ["  ", fit("name", cols.name), cols.slot ? gap + fit("slot", cols.slot, "right") : "", cols.profile ? gap + fit("profile", cols.profile) : "", cols.backend ? gap + fit("backend", cols.backend) : "",
    gap + fit("status", cols.status), gap + fit("mem", cols.mem, "right"), cols.share ? gap + fit("", cols.share) : "", cols.url ? gap + fit("url", cols.url) : ""].join("");
  return (
    <Box height={height} flexDirection="column">
      <Text color={C.tx3} wrap="truncate">{head}</Text>
      {rows.slice(start, start + room).map((r, i) => (
        <ListRow key={r.name} row={r} cols={cols} selected={start + i === selected} pending={pending[r.name]} width={width} />
      ))}
    </Box>
  );
}

/** @jsxRuntime automatic @jsxImportSource react */
import { Box, Text } from "ink";
import type { Source } from "../data/types";
import { C } from "../theme/palette";
import { useLogStream } from "./use-log-stream";

type Props = { source: Source; name: string; svc: string; services: string[]; scroll: number; width: number; height: number };

// scroll counts lines up from the bottom; 0 follows
export function LogsView({ source, name, svc, services, scroll, width, height }: Props) {
  const { lines, ended } = useLogStream(source, name, svc);
  const room = Math.max(1, height - 1);
  const end = Math.max(0, lines.length - scroll);
  const shown = lines.slice(Math.max(0, end - room), end);
  return (
    <Box height={height} flexDirection="column" paddingX={1}>
      <Text wrap="truncate">
        <Text bold color={C.tx}>{name}</Text>
        <Text color={C.tx3}>  logs  </Text>
        {services.map((s) => <Text key={s} color={s === svc ? C.amb : C.tx3}>{s === svc ? `[${s}]` : ` ${s} `} </Text>)}
        <Text color={C.tx3}>{scroll ? `  ↑${scroll}` : ended && lines.length ? `  ${ended}` : "  following"}</Text>
      </Text>
      <Box flexDirection="column" height={room} overflow="hidden">
        {!lines.length && <Text color={C.tx3}>{ended ?? "waiting for output…"}</Text>}
        {shown.map((l, i) => <Text key={end - shown.length + i} color={l.err ? C.errTx : C.tx2} wrap="truncate">{l.text.slice(0, width * 2) || " "}</Text>)}
      </Box>
    </Box>
  );
}

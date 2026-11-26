/** @jsxRuntime automatic @jsxImportSource react */
import type { ReactNode } from "react";
import { Box, Text } from "ink";
import type { Row } from "../data/types";
import { C, healthColor, shareColor, stateColor, stateLabel } from "../theme/palette";
import { fit, mem } from "../lib/text";

type Props = { row: Row; width: number; height: number };

const kv = (k: string, v: ReactNode) => <Text wrap="truncate"><Text color={C.tx3}>{k.padEnd(9)}</Text>{v}</Text>;

// flat lines sliced to the pane height, so a short terminal clips instead of overlapping
export function DetailView({ row, width, height }: Props) {
  const svcW = Math.min(18, Math.max(7, ...row.services.map((s) => s.service.length + 2)));
  const urlW = Math.max(0, width - 2 - svcW - 2 - 13 - 7 - 9);
  const sh = row.share;
  const lines: ReactNode[] = [
    <Text wrap="truncate">
      <Text bold color={C.tx}>{row.label}</Text>
      {row.label !== row.name && <Text color={C.tx3}>  {row.name}</Text>}
      <Text color={stateColor(row.state)}>  ● {stateLabel(row.state)}</Text>
      <Text color={C.tx3}>  {row.up}/{row.of} up</Text>
    </Text>,
    kv("slot", <>{row.slot}  <Text color={C.tx3}>backend</Text> {row.backend}  <Text color={C.tx3}>profile</Text> {row.profile}  <Text color={C.tx3}>mode</Text> {row.mode}</>),
    kv("memory", mem(row.memMiB)),
    kv("url", <Text color={C.cyan}>{row.url}</Text>),
    kv("share", sh
      ? <><Text color={shareColor(sh.state)}>{sh.state}</Text>{sh.reason ? <Text color={C.tx3}> ({sh.reason})</Text> : null}  <Text color={C.cyan}>{sh.url || "(no URL)"}</Text>  <Text color={C.tx3}>{sh.public ? "public" : `user ${sh.user}`} · {sh.fe} at /</Text></>
      : <Text color={C.tx3}>not shared (s shares it)</Text>),
    ...row.warnings.map((w) => kv("warning", <Text color={C.amb}>{w}</Text>)),
    <Text> </Text>,
    <Text color={C.tx3} wrap="truncate">{fit("service", svcW)}  {fit("status", 12)} {fit("port", 6, "right")} {fit("mem", 6, "right")}  url</Text>,
    ...row.services.map((s) => (
      <Text wrap="truncate">
        <Text color={healthColor(s.healthy, s.running)}>● </Text>
        <Text color={C.tx2}>{fit(s.service, svcW - 2)}  </Text>
        <Text color={s.running ? C.tx2 : C.tx3}>{fit(s.status, 12)} </Text>
        <Text color={C.tx3}>{fit(s.port ? String(s.port) : "–", 6, "right")} </Text>
        <Text color={C.tx2}>{fit(mem(s.memMiB), 6, "right")}  </Text>
        <Text color={C.cyan}>{urlW > 0 ? fit(s.url ?? "", urlW) : ""}</Text>
      </Text>
    )),
  ];
  return (
    <Box height={height} flexDirection="column" paddingX={1} overflow="hidden">
      {lines.slice(0, height).map((l, i) => <Box key={i} flexShrink={0}>{l}</Box>)}
    </Box>
  );
}

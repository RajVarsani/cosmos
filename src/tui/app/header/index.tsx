/** @jsxRuntime automatic @jsxImportSource react */
import { Text } from "ink";
import { C } from "../../theme/palette";

type Props = { project: string; count: number | null; running: number; mode: "list" | "galaxy"; filter: string };

export function Header({ project, count, running, mode, filter }: Props) {
  const right = mode === "galaxy" ? "galaxy" : "";
  return (
    <Text wrap="truncate">
      <Text bold color={C.tx}>cosmos top</Text>
      {project ? <Text color={C.tx3}>  {project}</Text> : null}
      {count === null ? null : <Text color={C.tx3}>  {count} instance{count === 1 ? "" : "s"}</Text>}
      {count ? <Text color={C.grn}>  {running} running</Text> : null}
      {filter ? <Text color={C.amb}>  /{filter}</Text> : null}
      <Text color={C.tx3}>{right ? `  · ${right}` : ""}</Text>
    </Text>
  );
}

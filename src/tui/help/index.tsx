/** @jsxRuntime automatic @jsxImportSource react */
import { Box, Text } from "ink";
import { C } from "../theme/palette";

export const KEYS: [string, string][] = [
  ["j k ↑ ↓", "move"],
  ["enter", "details: services, ports, URLs, share"],
  ["l", "logs (main frontend; tab cycles services)"],
  ["o", "open the main URL in the browser"],
  ["s", "share on or off"],
  ["d", "take down (asks y/n)"],
  ["/", "filter by name"],
  ["g", "galaxy view"],
  ["?", "this help"],
  ["esc", "back"],
  ["q ctrl-c", "quit"],
];

export function HelpView({ height }: { height: number }) {
  return (
    <Box height={height} flexDirection="column" alignItems="center" justifyContent="center">
      <Box flexDirection="column" borderStyle="round" borderColor={C.tx3} paddingX={2} paddingY={1}>
        <Text bold color={C.tx}>cosmos top</Text>
        <Text> </Text>
        {KEYS.map(([k, v]) => (
          <Text key={k}><Text color={C.amb}>{k.padEnd(10)}</Text><Text color={C.tx2}>{v}</Text></Text>
        ))}
        <Text> </Text>
        <Text color={C.tx3}>any key closes</Text>
      </Box>
    </Box>
  );
}

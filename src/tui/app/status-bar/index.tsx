/** @jsxRuntime automatic @jsxImportSource react */
import { Text } from "ink";
import { C } from "../../theme/palette";

export type Flash = { text: string; error: boolean } | null;
export type Prompt = { kind: "confirm"; name: string } | { kind: "filter"; draft: string } | null;

type Props = { flash: Flash; prompt: Prompt; hint: string; sourceError: string | null };

export function StatusBar({ flash, prompt, hint, sourceError }: Props) {
  if (prompt?.kind === "confirm") return <Text wrap="truncate"><Text color={C.amb}>take down {prompt.name}? </Text><Text color={C.tx2}>y / n</Text></Text>;
  if (prompt?.kind === "filter") return <Text wrap="truncate"><Text color={C.amb}>/</Text><Text color={C.tx}>{prompt.draft}</Text><Text color={C.tx3}>▏ enter keeps · esc clears</Text></Text>;
  if (flash) return <Text wrap="truncate" color={flash.error ? C.errTx : C.grn}>{flash.text}</Text>;
  if (sourceError) return <Text wrap="truncate" color={C.errTx}>{sourceError}</Text>;
  return <Text wrap="truncate" color={C.tx3}>{hint}</Text>;
}

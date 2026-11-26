/** @jsxRuntime automatic @jsxImportSource react */
import { render } from "ink";
import { CosmosError } from "../errors";
import { App } from "./app";
import type { Source } from "./data/types";

export async function topMain(o: { demo: boolean }): Promise<void> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) throw new CosmosError("cosmos top needs an interactive terminal; use cosmos ls --json or cosmos status --json instead");
  const source: Source = o.demo ? (await import("./data/demo")).demoSource() : (await import("./data/live")).liveSource();
  try {
    const app = render(<App source={source} />, { alternateScreen: true, exitOnCtrlC: false, maxFps: 30, incrementalRendering: true });
    await app.waitUntilExit();
  } finally {
    source.close();
  }
  // a log follower or probe may still hold the loop open
  process.exit(0);
}

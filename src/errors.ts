export class CosmosError extends Error {
  constructor(message: string, public detail: Record<string, unknown> = {}) {
    super(message);
  }
}

// How an operation talks back: `log` for status lines, `output` for raw subprocess output (e.g. image builds).
export type Reporter = { log: (m: string) => void; output?: (chunk: string, stream: "stdout" | "stderr") => void; inherit?: boolean };

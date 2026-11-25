export type RunResult = { code: number; stdout: string; stderr: string };

export type RunOpts = {
  check?: boolean;
  quiet?: boolean;
  inherit?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  // Kills the process after this long; the result then carries code 124.
  timeoutMs?: number;
  // Receives stdout+stderr chunks as they arrive (still captured in the result).
  onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
};

async function drain(stream: ReadableStream<Uint8Array>, name: "stdout" | "stderr", onOutput?: RunOpts["onOutput"]): Promise<string> {
  if (!onOutput) return new Response(stream).text();
  const dec = new TextDecoder();
  let out = "";
  for await (const buf of stream) {
    const s = dec.decode(buf, { stream: true });
    out += s;
    onOutput(s, name);
  }
  return out;
}

export async function run(cmd: string[], opts: RunOpts = {}): Promise<RunResult> {
  const p = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: opts.inherit ? "inherit" : "pipe",
    stderr: opts.inherit ? "inherit" : "pipe",
    stdin: opts.stdin !== undefined ? new TextEncoder().encode(opts.stdin) : "ignore",
  });
  let timedOut = false;
  const timer = opts.timeoutMs ? setTimeout(() => ((timedOut = true), p.kill()), opts.timeoutMs) : null;
  const [stdout, stderr] = opts.inherit
    ? ["", ""]
    : await Promise.all([drain(p.stdout as ReadableStream, "stdout", opts.onOutput), drain(p.stderr as ReadableStream, "stderr", opts.onOutput)]);
  const exited = await p.exited;
  if (timer) clearTimeout(timer);
  const code = timedOut ? 124 : exited;
  if (opts.check && code !== 0) throw new Error(`${cmd.join(" ")} failed (${code}): ${stderr.trim().slice(-2000)}`);
  return { code, stdout, stderr };
}

// read-only git never takes index.lock or refreshes the index of a checkout it only looks at
export const GIT_ENV = { GIT_OPTIONAL_LOCKS: "0" };

import * as ops from "../../../ops";
import { stripAnsi } from "../../lib/text";
import type { LogLine } from "../types";

const TAIL = 300;
const TS = /^\d{4}-\d\d-\d\dT[\d:.]+Z\s/;

// follows a service's logs like the dashboard's log stream; returns a stop function
export function streamLogs(name: string, svc: string, onLines: (l: LogLine[]) => void, onEnd: (reason: string) => void): () => void {
  let proc: ReturnType<typeof ops.spawnLogs>;
  try {
    proc = ops.spawnLogs(name, svc, TAIL);
  } catch (e) {
    queueMicrotask(() => onEnd((e as Error).message));
    return () => {};
  }
  let stopped = false;
  const pump = async (s: ReadableStream<Uint8Array>, err: boolean) => {
    const dec = new TextDecoder();
    let partial = "";
    for await (const buf of s) {
      const parts = (partial + dec.decode(buf, { stream: true })).split("\n");
      partial = parts.pop() ?? "";
      const batch = parts.filter(Boolean).map((raw) => ({ text: stripAnsi(raw).replace(/\r/g, "").replace(TS, ""), err }));
      if (batch.length && !stopped) onLines(batch);
    }
  };
  Promise.all([pump(proc.stdout as ReadableStream, false), pump(proc.stderr as ReadableStream, true)])
    .then(() => proc.exited)
    .then((code) => !stopped && onEnd(code === 0 ? "container stopped" : `docker compose logs exited ${code}`))
    .catch(() => !stopped && onEnd("log stream closed"));
  return () => {
    stopped = true;
    try {
      proc.kill();
    } catch {}
  };
}

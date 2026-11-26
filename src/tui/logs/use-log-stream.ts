import { useEffect, useState } from "react";
import type { LogLine, Source } from "../data/types";

const KEEP = 2000;

export function useLogStream(source: Source, name: string, svc: string) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [ended, setEnded] = useState<string | null>(null);
  useEffect(() => {
    setLines([]);
    setEnded(null);
    // batch bursts into one render per frame-ish tick
    let buf: LogLine[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const add = buf;
      buf = [];
      setLines((prev) => { const next = prev.concat(add); return next.length > KEEP ? next.slice(-KEEP) : next; });
    };
    const stop = source.logs(name, svc, (l) => {
      buf.push(...l);
      timer ??= setTimeout(flush, 50);
    }, setEnded);
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, [source, name, svc]);
  return { lines, ended };
}

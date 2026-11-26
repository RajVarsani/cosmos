import { useEffect, useState } from "react";
import type { Snapshot, Source } from "./types";

const sig = (s: Snapshot) => JSON.stringify([s.project, s.rows, s.error]);

// re-renders only when the rows or the error change, not on every poll
export function useSnapshot(source: Source): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let prev = "";
    return source.subscribe((s) => {
      const k = sig(s);
      if (k === prev) return;
      prev = k;
      setSnap(s);
    });
  }, [source]);
  return snap;
}

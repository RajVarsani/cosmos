import { useEffect, useState } from "react";

// re-render on a clock while the tab is visible; for "ago" and durations
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

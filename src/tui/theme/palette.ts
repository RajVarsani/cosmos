// dashboard tokens (src/dashboard/app/src/styles/tokens.css) and state classes (domain/states.ts)
export const C = {
  tx: "#ededeb",
  tx2: "#9d9d9a",
  tx3: "#6c6c68",
  grn: "#22e3a0",
  yel: "#e6ef5a",
  red: "#ff5b7a",
  amb: "#ffc46b",
  cyan: "#5ad7ff",
  errTx: "#ffb3c1",
  sel: "#1d1d20",
};

export const TRANSIT = new Set(["creating", "starting", "stopping", "removing", "booting", "switching"]);
export const BAD = new Set(["exited", "unresponsive", "restarting"]);
export const LABEL: Record<string, string> = { partial: "partial", running: "running", booting: "booting", creating: "launching", starting: "starting", stopping: "stopping", removing: "removing", switching: "switching", stopped: "stopped", exited: "exited", restarting: "restarting", unresponsive: "no answer" };

export const stateColor = (s: string) => (s === "running" ? C.grn : TRANSIT.has(s) ? C.yel : BAD.has(s) ? C.red : C.tx3);
export const stateLabel = (s: string) => LABEL[s] ?? s;

// shareTone in domain/share.ts
export const shareColor = (state: string) => (state === "live" ? C.grn : state === "restarting" || state === "unavailable" ? C.amb : state === "stopped" ? C.tx3 : C.yel);

export const healthColor = (h: boolean | null, running: boolean) => (h === null ? C.tx3 : h ? C.grn : running ? C.yel : C.red);

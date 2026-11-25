import type { Instance } from "./types";

export const TRANSIT = new Set(["creating", "starting", "stopping", "removing", "booting", "switching"]);
export const BAD = new Set(["exited", "unresponsive", "restarting"]);
export const LABEL: Record<string, string> = { partial: "partial", running: "running", booting: "booting", creating: "launching", starting: "starting", stopping: "stopping", removing: "removing", switching: "switching", stopped: "stopped", exited: "exited", restarting: "restarting", unresponsive: "no answer" };
export const stCls = (s: string) => (s === "running" ? "ok" : TRANSIT.has(s) ? "go" : BAD.has(s) ? "bad" : "");
export const lbl = (i: Pick<Instance, "name" | "label"> | null | undefined) => (i ? i.label || i.name : "");

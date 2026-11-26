export type GalaxyBody = { id: string; name: string; slot: number; health: "running" | "starting" | "degraded" | "stopped" | "error"; memMiB: number; busy: boolean };

export type Style = { color?: string; dim?: boolean; bold?: boolean };
export type Seg = Style & { text: string };
export type Line = Seg[];
export type Frame = { lines: Line[]; key: string };

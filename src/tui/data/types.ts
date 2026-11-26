export type SvcRow = {
  service: string;
  kind: string;
  port: number | null;
  url: string | null;
  status: string;
  running: boolean;
  healthy: boolean | null;
  memMiB: number | null;
};

export type ShareRow = { url: string; state: string; reason: string | null; public: boolean; user: string | null; fe: string };

export type Row = {
  name: string;
  label: string;
  slot: number;
  profile: string;
  backend: string;
  mode: string;
  state: string;
  up: number;
  of: number;
  memMiB: number | null;
  mainService: string;
  url: string;
  services: SvcRow[];
  share: ShareRow | null;
  warnings: string[];
};

export type Snapshot = { project: string; rows: Row[]; at: number; error: string | null };

export type Action = "share" | "unshare" | "down";

export type LogLine = { text: string; err: boolean };

export type Source = {
  subscribe(cb: (s: Snapshot) => void): () => void;
  act(action: Action, name: string): Promise<string>;
  logs(name: string, svc: string, onLines: (l: LogLine[]) => void, onEnd: (reason: string) => void): () => void;
  close(): void;
};

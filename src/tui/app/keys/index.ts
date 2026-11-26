import type { Key } from "ink";
import type { Action, Row } from "../../data/types";
import type { Prompt } from "../status-bar";

export type Pane = "detail" | "logs" | "help" | null;

export type KeyCtx = {
  rows: Row[];
  sel: Row | undefined;
  index: number;
  pane: Pane;
  prompt: Prompt;
  filter: string;
  logSvc: string;
  move: (to: number) => void;
  setPane: (p: Pane) => void;
  setPrompt: (p: Prompt) => void;
  setFilter: (f: string) => void;
  setLogSvc: (s: string) => void;
  scrollLogs: (by: number | "bottom") => void;
  toggleGalaxy: () => void;
  act: (a: Action, r: Row) => void;
  share: (r: Row) => void;
  open: (r: Row) => void;
  quit: () => void;
};

export function handleKey(input: string, key: Key, c: KeyCtx): void {
  if (key.ctrl && input === "c") return c.quit();

  if (c.prompt?.kind === "confirm") {
    const name = c.prompt.name;
    c.setPrompt(null);
    const r = c.rows.find((x) => x.name === name);
    if (input.toLowerCase() === "y" && r) c.act("down", r);
    return;
  }
  if (c.prompt?.kind === "filter") {
    const d = c.prompt.draft;
    if (key.escape) return (c.setFilter(""), c.setPrompt(null));
    if (key.return) return c.setPrompt(null);
    const next = key.backspace || key.delete ? d.slice(0, -1) : input && !key.ctrl && !key.meta ? d + input : d;
    c.setFilter(next);
    return c.setPrompt({ kind: "filter", draft: next });
  }

  if (c.pane === "help") return c.setPane(null);

  if (c.pane === "logs") {
    if (key.escape || input === "l" || input === "q") return c.setPane(null);
    if (key.tab && c.sel) {
      const svcs = c.sel.services.map((s) => s.service);
      return c.setLogSvc(svcs[(svcs.indexOf(c.logSvc) + (key.shift ? svcs.length - 1 : 1)) % svcs.length]);
    }
    if (input === "k" || key.upArrow) return c.scrollLogs(1);
    if (input === "j" || key.downArrow) return c.scrollLogs(-1);
    if (key.pageUp) return c.scrollLogs(20);
    if (key.pageDown) return c.scrollLogs(-20);
    if (input === "G") return c.scrollLogs("bottom");
    return;
  }

  if (input === "q") return c.quit();
  if (key.escape) {
    if (c.pane) return c.setPane(null);
    if (c.filter) return c.setFilter("");
    return;
  }
  if (input === "j" || key.downArrow) return c.move(c.index + 1);
  if (input === "k" || key.upArrow) return c.move(c.index - 1);
  if (input === "?") return c.setPane("help");
  if (input === "/") return c.setPrompt({ kind: "filter", draft: c.filter });
  if (input === "g") return c.toggleGalaxy();
  if (!c.sel) return;
  if (key.return) return c.setPane(c.pane === "detail" ? null : "detail");
  if (input === "l") return (c.setLogSvc(c.sel.mainService), c.scrollLogs("bottom"), c.setPane("logs"));
  if (input === "o") return c.open(c.sel);
  if (input === "s") return c.share(c.sel);
  if (input === "d") return c.setPrompt({ kind: "confirm", name: c.sel.name });
}

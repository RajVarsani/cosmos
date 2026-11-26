/** @jsxRuntime automatic @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import type { Action, Row, Source } from "../data/types";
import { useSnapshot } from "../data/use-snapshot";
import { C, TRANSIT } from "../theme/palette";
import { ListView } from "../list";
import { DetailView } from "../detail";
import { LogsView } from "../logs";
import { HelpView } from "../help";
import { GalaxyView } from "../galaxy";
import { toBodies } from "../galaxy-bridge";
import { openUrl } from "../lib/open-url";
import { Header } from "./header";
import { StatusBar, type Flash, type Prompt } from "./status-bar";
import { handleKey, type Pane } from "./keys";

const HINT = "j/k move · enter details · l logs · o open · s share · d down · / filter · g galaxy · ? help · q quit";
const LOG_HINT = "tab next service · j/k scroll · G follow · esc back";
const DETAIL_ROWS = 14;

// the dashboard's share gate (domain/share.ts canShare)
const canShare = (r: Row) => !(TRANSIT.has(r.state) && r.state !== "booting") && r.services.some((s) => s.running);

export function App({ source }: { source: Source }) {
  const { exit } = useApp();
  const { columns, rows: height } = useWindowSize();
  const snap = useSnapshot(source);
  const [selName, setSelName] = useState<string | null>(null);
  const [galaxy, setGalaxy] = useState(false);
  const [pane, setPane] = useState<Pane>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [filter, setFilter] = useState("");
  const [logSvc, setLogSvc] = useState("");
  const [logScroll, setLogScroll] = useState(0);
  const [flash, setFlash] = useState<Flash>(null);
  const [pending, setPending] = useState<Record<string, Action>>({});

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.error ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const all = snap?.rows ?? [];
  const rows = useMemo(() => (filter ? all.filter((r) => `${r.name} ${r.label}`.toLowerCase().includes(filter.toLowerCase())) : all), [all, filter]);
  const found = rows.findIndex((r) => r.name === selName);
  const index = found < 0 ? 0 : found;
  const sel = rows[index];
  const bodies = useMemo(() => toBodies(rows, pending), [rows, pending]);

  const act = (a: Action, r: Row) => {
    if (pending[r.name]) return setFlash({ text: `${r.name} is busy (${pending[r.name]})`, error: true });
    setPending((p) => ({ ...p, [r.name]: a }));
    source.act(a, r.name)
      .then((text) => setFlash({ text, error: false }))
      .catch((e) => setFlash({ text: (e as Error).message, error: true }))
      .finally(() => setPending(({ [r.name]: _, ...rest }) => rest));
  };

  useInput((input, key) => handleKey(input, key, {
    rows, sel, index, pane, prompt, filter, logSvc,
    move: (to) => rows.length && setSelName(rows[Math.min(Math.max(0, to), rows.length - 1)].name),
    setPane, setPrompt, setFilter, setLogSvc,
    scrollLogs: (by) => setLogScroll((s) => (by === "bottom" ? 0 : Math.max(0, s + by))),
    toggleGalaxy: () => setGalaxy((g) => !g),
    act,
    share: (r) => (r.share ? act("unshare", r) : canShare(r) ? act("share", r) : setFlash({ text: `${r.name} is not running; start it before sharing`, error: true })),
    open: (r) => openUrl(r.url).then(() => setFlash({ text: `opened ${r.url}`, error: false }), (e) => setFlash({ text: (e as Error).message, error: true })),
    quit: () => exit(),
  }));

  const bodyH = Math.max(3, height - 3);
  const detailH = pane === "detail" && sel ? Math.min(DETAIL_ROWS + sel.services.length, Math.floor(bodyH * 0.6)) : 0;
  const mainH = bodyH - detailH;
  const running = all.filter((r) => r.state === "running").length;

  return (
    <Box flexDirection="column" width={columns} height={height}>
      <Header project={snap?.project ?? ""} count={snap ? all.length : null} running={running} mode={galaxy ? "galaxy" : "list"} filter={filter} />
      <Box height={1}><Text color={C.tx3}>{"─".repeat(columns)}</Text></Box>
      {!snap ? (
        <Box height={bodyH} justifyContent="center" alignItems="center"><Text color={C.tx3}>reading instances…</Text></Box>
      ) : pane === "help" ? (
        <HelpView height={bodyH} />
      ) : pane === "logs" && sel ? (
        <LogsView source={source} name={sel.name} svc={logSvc || sel.mainService} services={sel.services.map((s) => s.service)} scroll={logScroll} width={columns} height={bodyH} />
      ) : (
        <Box flexDirection="column" height={bodyH}>
          {galaxy
            ? <GalaxyView bodies={bodies} width={columns} height={mainH} selectedId={sel?.name} />
            : <ListView rows={rows} selected={index} width={columns} height={mainH} pending={pending} filtered={!!filter && !!all.length} />}
          {detailH > 0 && sel && (
            <Box flexDirection="column" height={detailH} borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} borderColor={C.tx3}>
              <DetailView row={sel} width={columns} height={detailH - 1} />
            </Box>
          )}
        </Box>
      )}
      <StatusBar flash={flash} prompt={prompt} hint={pane === "logs" ? LOG_HINT : HINT} sourceError={snap?.error ?? null} />
    </Box>
  );
}

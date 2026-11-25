import { mainOf, urlOf } from "@/domain/services";
import { TRANSIT } from "@/domain/states";
import type { Instance } from "@/domain/types";
import { IconButton } from "@/modules/ui/icon-button";
import { IconLogs, IconRemove, IconStart, IconStop } from "@/modules/ui/icons";
import { act, closeDrawer, focusSystem } from "@/state/actions";
import { ConfirmRemove } from "./confirm-remove";
import { ActsFrame } from "./frame";
import { OpenCopy } from "./open-copy";
import { ShareButton } from "./share-button";
import { useUi } from "@/state/ui-store";

const unfocus = () => { closeDrawer(); focusSystem(null); };

// open, copy, share, logs, stop or start, remove; or the remove confirmation in their place
export function BarActions({ i }: { i: Instance }) {
  const confirm = useUi((u) => u.confirm === i.name);
  const busy = TRANSIT.has(i.state) && i.state !== "booting", live = i.containers.some((c) => c.running);
  const url = urlOf(i), first = mainOf(i);
  const lead = confirm ? (
    <ConfirmRemove i={i} />
  ) : (
    <>
      <OpenCopy url={url} open={!!url && live} />
      <ShareButton i={i} disabled={busy || !live} />
      <IconButton data-act="logs" disabled={!first} title="Logs  (L)" aria-label="logs" onClick={() => act("logs", i.name, first?.service)}><IconLogs /></IconButton>
      {live || i.state === "stopping"
        ? <IconButton data-act="stop" disabled={busy} title="Stop" aria-label="stop" onClick={() => act("stop", i.name)}><IconStop /></IconButton>
        : <IconButton data-act="start" disabled={busy} title="Start" aria-label="start" onClick={() => act("start", i.name)}><IconStart /></IconButton>}
      <IconButton dan data-act="ask" disabled={busy} title="Remove…" aria-label="remove" onClick={() => act("ask", i.name)}><IconRemove /></IconButton>
    </>
  );
  return <ActsFrame lead={lead} back={{ title: "Back to galaxy  (Esc)", label: "back to galaxy", onClick: unfocus }} />;
}

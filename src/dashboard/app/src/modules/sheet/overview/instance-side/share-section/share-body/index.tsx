import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { canShare, shareTone } from "@/domain/share";
import type { Instance } from "@/domain/types";
import { Chip } from "@/modules/ui/chip";
import { cx } from "@/modules/ui/glass";
import { Kvs } from "@/modules/ui/kvs";
import { overlay, T } from "@/lib/motion/spec";
import { shareSystem, unshareSystem } from "@/state/actions";
import { useUi } from "@/state/ui-store";
import { CredRow } from "./cred-row";
import { PasswordSwitch } from "./password-switch";
import { previewText } from "./preview-text";
import s from "./share-body.module.css";

// one body for the side column's SHARE section and the bar's share popover
export function ShareBody({ i }: { i: Instance }) {
  const busy = useUi((u) => u.sharing[i.name]);
  // pre-share choice, then the flip in flight until the overview carries it
  const [want, setWant] = useState<boolean | null>(null);
  const sh = i.share;
  const flip = (gated: boolean) => {
    setWant(gated);
    if (sh) void shareSystem(i.name, { public: !gated }).finally(() => setWant(null));
  };
  if (!sh) {
    const gated = want ?? false;
    return (
      <>
        <div className={s.row}>
          <span className={s.muted}>not shared</span>
          <Chip className={s.btn} disabled={!!busy || !canShare(i)} aria-busy={busy === "share"} onClick={() => void shareSystem(i.name, { public: !gated }).finally(() => setWant(null))}>{busy === "share" ? "sharing…" : "share"}</Chip>
        </div>
        <PasswordSwitch on={gated} busy={!!busy} onFlip={flip} />
      </>
    );
  }
  const gated = want ?? !sh.public;
  return (
    <>
      {sh.notice && (
        <div className={s.notice} role="alert">
          <p>{sh.notice}</p>
          <CredRow k="origin" v={sh.url} />
        </div>
      )}
      {sh.warnings?.map((w) => <p key={w} className={cx(s.warn, /live customer data/.test(w) && s.alert)} role="alert">{w}</p>)}
      <div className={s.creds}>
        <CredRow k="link" v={sh.url} href={sh.url} />
        <PasswordSwitch on={gated} busy={!!busy} onFlip={flip} />
        <AnimatePresence initial={false}>
          {!sh.public && sh.password != null && (
            <motion.div key="creds" className={s.gate} {...overlay} transition={T.base}>
              {sh.user != null && <CredRow k="user" v={sh.user} />}
              <CredRow k="password" v={sh.password} secret />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Kvs className={s.kvs}>
        <dt>zrok</dt><dd>{sh.zrokName}</dd>
        <dt>state</dt><dd><b className={s.state} data-tone={shareTone(sh)}>{sh.state}</b>{sh.reason ? ` · ${sh.reason}` : ""}</dd>
        {sh.preview && <><dt>preview</dt><dd data-tone={sh.preview.state === "failed" ? "warn" : undefined}>{previewText(sh.preview)}</dd></>}
        <dt>remote</dt><dd>{sh.remote}</dd>
      </Kvs>
      <div className={s.foot}>
        <Chip className={cx(s.btn, s.un)} disabled={!!busy} aria-busy={busy === "unshare"} onClick={() => unshareSystem(i.name)}>{busy === "unshare" ? "unsharing…" : "unshare"}</Chip>
      </div>
    </>
  );
}

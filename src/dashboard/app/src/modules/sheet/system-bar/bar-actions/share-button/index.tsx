import { useEffect, useRef, useState } from "react";
import { shareTone } from "@/domain/share";
import type { Instance } from "@/domain/types";
import { IconButton } from "@/modules/ui/icon-button";
import { IconShare } from "@/modules/ui/icons";
import { Tip } from "@/modules/ui/tip";
import { useUi } from "@/state/ui-store";
import { SharePanel } from "./share-panel";
import s from "./share-button.module.css";

// the globe: tinted by share state; click opens the share popover
export function ShareButton({ i, disabled }: { i: Instance; disabled: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const busy = useUi((u) => u.sharing[i.name]);
  const sh = i.share;
  const label = sh ? "shared" : "share";

  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest?.("[data-share-panel]") && !ref.current?.contains(t)) { setOpen(false); setHover(false); }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); setHover(false); } };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", out);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);

  return (
    <span ref={ref} className={s.wrap} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <IconButton data-act="share" data-tone={shareTone(sh)} className={s.btn} disabled={disabled && !sh} aria-busy={!!busy} aria-expanded={open} aria-haspopup="dialog" aria-label={label} onClick={() => setOpen((o) => !o)}>
        <IconShare />
      </IconButton>
      <Tip at={ref} open={hover && !open}>{label}</Tip>
      <SharePanel i={i} open={open} at={ref} />
    </span>
  );
}

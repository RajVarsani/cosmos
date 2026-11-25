import type { KeyboardEvent } from "react";
import { setUi } from "@/state/ui-store";
import type { CatView } from "../catalog";
import { ProfileGroup } from "./profile-group";
import { ppShow, ServicePopover } from "./service-popover";
import s from "./profile-picker.module.css";

const GROUPS = [["local", "Run locally"], ["remote", "Against a remote backend"]] as const;
const DIR: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

// one radio group across both groups: arrows move the selection, Enter goes on to the next step
function onKeyDown(e: KeyboardEvent) {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[role="radio"]');
  if (!b || e.metaKey || e.ctrlKey || e.altKey) return;
  const fm = b.closest("form");
  if (!fm) return;
  if (e.key === "Enter") {
    e.preventDefault(); e.stopPropagation();
    const nx = fm.querySelector<HTMLElement>('[data-backend][aria-pressed="true"]') || fm.querySelector<HTMLElement>('input[name="name"]');
    nx?.focus();
    return;
  }
  const dir = DIR[e.key];
  if (!dir) return;
  e.preventDefault(); e.stopPropagation();
  const all = [...fm.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')], nx = all[(all.indexOf(b) + dir + all.length) % all.length];
  if (!nx || nx === b) return;
  setUi((st) => ({ form: { ...st.form, profile: nx.dataset.profile ?? null } }));
  nx.focus({ preventScroll: true });
  nx.scrollIntoView({ block: "nearest" });
  ppShow(nx, true);
}

export function ProfilePicker({ k, profile }: { k: CatView; profile: string }) {
  const pick = (id: string) => setUi((st) => ({ form: { ...st.form, profile: id } }));
  return (
    <div className={s.plist} onKeyDown={onKeyDown}>
      {GROUPS.map(([kd, h]) => {
        const rows = k.profiles.filter((q) => (q.backendKind || "remote") === kd);
        return rows.length ? <ProfileGroup key={kd} heading={h} rows={rows} k={k} profile={profile} onPick={pick} /> : null;
      })}
      <ServicePopover />
    </div>
  );
}

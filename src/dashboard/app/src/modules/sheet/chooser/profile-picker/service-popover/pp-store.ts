import { create } from "zustand";

type Pp = { id: string | null; at: HTMLElement | null; n: number };
export const usePp = create<Pp>(() => ({ id: null, at: null, n: 0 }));

// force re-places the popover even when the same row is already showing
export function ppShow(row: HTMLElement | null, force?: boolean) {
  const { id, at, n } = usePp.getState();
  if (!row) return void (id && usePp.setState({ id: null, at: null }));
  if (!force && at === row && id) return;
  usePp.setState({ id: row.dataset.profile ?? null, at: row, n: n + 1 });
}

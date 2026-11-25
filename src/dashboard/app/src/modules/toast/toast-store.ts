import { create } from "zustand";

type Toast = { msg: string; err: boolean; id: number } | null;
export const useToast = create<{ t: Toast }>(() => ({ t: null }));

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
export function toast(msg: string, err?: boolean) {
  useToast.setState({ t: { msg, err: !!err, id: ++seq } });
  clearTimeout(timer);
  timer = setTimeout(() => useToast.setState({ t: null }), err ? 5200 : 2200);
}

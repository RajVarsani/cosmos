import { SRC_PAL, svcC } from "@/domain/palette";

export const colorOf = (sel: string[], key: string) => {
  const i = sel.indexOf(key);
  return i >= 0 ? SRC_PAL[i % SRC_PAL.length] : svcC(key.split("/")[1]);
};

export const tagOf = (sel: string[], key: string) => {
  const insts = new Set(sel.map((k) => k.split("/")[0]));
  const [n, s] = key.split("/");
  return insts.size > 1 ? `${n}·${s}` : s;
};

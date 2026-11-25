import s from "./glass.module.css";

export const glass = s.glass;
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

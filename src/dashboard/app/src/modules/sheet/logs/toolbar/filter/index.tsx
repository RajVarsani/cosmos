import { useEffect, useRef } from "react";
import { logsSetQ } from "../../logs-store";
import s from "./filter.module.css";

export function Filter() {
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <input
      className={s.q}
      id="lg-q"
      type="search"
      placeholder="filter lines   /"
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => {
        const v = e.target.value.trim().toLowerCase();
        clearTimeout(t.current);
        t.current = setTimeout(() => logsSetQ(v), 120);
      }}
    />
  );
}

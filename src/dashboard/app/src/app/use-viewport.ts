import { useEffect } from "react";
import { Cz } from "@/modules/scene/handle";
import { layoutUpdate } from "@/state/actions";
import { sheetPx } from "@/state/sheet-size";

export function useViewport() {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      clearTimeout(t);
      t = setTimeout(() => { document.body.style.setProperty("--sheet-h", `${sheetPx()}px`); layoutUpdate(false); Cz.refocus(true); }, 120);
    };
    addEventListener("resize", on);
    return () => { removeEventListener("resize", on); clearTimeout(t); };
  }, []);
}

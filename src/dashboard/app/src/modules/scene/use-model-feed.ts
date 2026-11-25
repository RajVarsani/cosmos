import { useEffect } from "react";
import type { Overview } from "@/domain/types";
import { ui, useUi } from "@/state/ui-store";
import { Cz } from "./handle";
import { galaxyModel } from "./model";

// one poll result in, one model out, whichever view draws it
function feed(d: Overview) {
  const first = !Cz.m;
  Cz.m = galaxyModel(d);
  if (Cz.eng) { Cz.eng.setModel(Cz.m); if (first) Cz.eng.refocus(true); }
}

export function useModelFeed() {
  useEffect(() => {
    let last = ui().data;
    if (last) feed(last);
    return useUi.subscribe((s) => { if (s.data && s.data !== last) { last = s.data; feed(s.data); } });
  }, []);
}

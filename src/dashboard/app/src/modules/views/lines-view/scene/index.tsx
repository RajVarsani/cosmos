import { useEffect, useRef } from "react";
import { RM } from "@/lib/motion/reduced";
import { layoutUpdate } from "@/state/actions";
import { Cz } from "@/modules/scene/handle";
import { createLineEngine } from "./engine";
import { paperGrain } from "./paper";
import "./lines.css";

// the lightweight scene: canvas 2D only, drawn on demand
export function LinesScene() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    el.style.setProperty("--ln-grain", paperGrain(el));
    const eng = createLineEngine();
    Cz.eng = eng;
    if (Cz.ins) eng.ins = Cz.ins;
    eng.init(el);
    if (Cz.m) { eng.setModel(Cz.m); if (Cz.pose) eng.loadPose(Cz.pose); else eng.refocus(true); }
    eng.wake();
    const onWake = () => eng.wake();
    const onRm = () => { eng.wake(); eng.still(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    RM.addEventListener("change", onRm);
    document.fonts?.ready.then(() => {
      layoutUpdate(false);
      eng.lab?.forEach((l) => (l._w = 0));
      eng.still();
    });
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      RM.removeEventListener("change", onRm);
      if (eng.ok) Cz.pose = eng.savePose();
      eng.dispose();
      if (Cz.eng === eng) Cz.eng = null;
    };
  }, []);

  return (
    <div className="cosmos cz-lines" ref={host}>
      <div className="cz-labels" id="cz-labels" />
      <div className="tip" id="cz-tip" />
    </div>
  );
}

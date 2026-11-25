import { useEffect, useRef, useState } from "react";
import { RM } from "@/lib/motion/reduced";
import { layoutUpdate } from "@/state/actions";
import { Cz } from "@/modules/scene/handle";
import { createEngine, type Engine } from "../engine";
import { Fallback } from "../fallback";
import "./webgl.css";

// the three.js scene; unmounting it disposes the renderer and frees the GL context
export function WebGlScene() {
  const host = useRef<HTMLDivElement>(null);
  const [fail, setFail] = useState<string | null>(null);

  useEffect(() => {
    let eng: Engine | null = null;
    try {
      const probe = document.createElement("canvas");
      if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) throw new Error("no webgl");
      eng = createEngine();
      Cz.eng = eng;
      if (Cz.ins) eng.ins = Cz.ins;
      eng.init(host.current!);
      if (Cz.m) { eng.setModel(Cz.m); if (Cz.pose) eng.loadPose(Cz.pose); else eng.refocus(true); }
      eng.wake();
    } catch (e) {
      setFail((e as Error).message);
    }
    const onVis = () => { if (!document.hidden) Cz.wake(); };
    const onRm = () => { Cz.wake(); Cz.still(); };
    document.addEventListener("visibilitychange", onVis);
    RM.addEventListener("change", onRm);
    document.fonts?.ready.then(() => {
      layoutUpdate(false);
      if (Cz.eng) { Cz.eng.labelSizes = null; Cz.eng.lab?.forEach((el) => (el._w = 0)); }
      Cz.still();
    });
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      RM.removeEventListener("change", onRm);
      if (eng?.ok) Cz.pose = eng.savePose();
      eng?.dispose();
      if (Cz.eng === eng) Cz.eng = null;
    };
  }, []);

  return (
    <div className="cosmos" ref={host}>
      <div className="cz-labels" id="cz-labels" />
      <Fallback msg={fail} />
      <div className="tip" id="cz-tip" />
    </div>
  );
}

import { useRef } from "react";
import { barPx, layoutUpdate, sheetClose, sheetOpen, sheetPx, sheetSet, sheetShow, sheetSize, sheetSnap, sheetTab, sheetToggle } from "@/state/actions";
import { det } from "@/state/sheet-size";
import { saveSheet, setUi, ui } from "@/state/ui-store";
import s from "./grip.module.css";

// drag to size, click to toggle, arrows to step, double click to flip size
export function Grip() {
  const d = useRef({ y0: 0, h0: 0, on: false, moved: false, fromBar: false });
  return (
    <div
      className={s.grip} id="grip" role="separator" aria-orientation="horizontal" aria-label="resize, arrow keys" tabIndex={0}
      onPointerDown={(e) => { const g = d.current; g.on = true; g.moved = false; g.y0 = e.clientY; g.fromBar = !ui().logs; g.h0 = g.fromBar ? barPx() : sheetPx(); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => {
        const g = d.current;
        if (!g.on) return;
        if (!g.moved && Math.abs(e.clientY - g.y0) < 4) return;
        if (!g.moved) { g.moved = true; setUi({ sizing: true }); if (g.fromBar) { setUi({ logs: true }); sheetTab("sys"); sheetShow(true); } }
        sheetSet(g.h0 + (g.y0 - e.clientY));
      }}
      onPointerUp={(e) => end(e.clientY)}
      onPointerCancel={(e) => end(e.clientY)}
      onDoubleClick={() => { if (ui().logs) sheetSize(); }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const u = ui();
        if (e.key === "ArrowUp") { if (!u.logs) return sheetOpen(); setUi({ sheetD: 1 }); }
        else {
          if (!u.sheetD || u.sheetH) { setUi({ sheetH: 0, sheetD: 0 }); if (sheetPx() >= innerHeight * det()[0] - 1) return sheetClose(); }
          setUi({ sheetD: 0 });
        }
        setUi({ sheetH: 0 }); saveSheet(); layoutUpdate();
      }}
    />
  );
  function end(y: number) {
    const g = d.current;
    if (!g.on) return;
    g.on = false;
    setUi({ sizing: false });
    if (!g.moved) { if (ui().focus) sheetToggle(); return; }
    if (sheetPx() <= 200 && y - g.y0 > 30) { setUi({ sheetH: 0 }); sheetClose(); return; }
    sheetSnap();
    sheetShow();
  }
}

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { T } from "@/lib/motion/spec";
import { cx, glass } from "@/modules/ui/glass";
import { useUi } from "@/state/ui-store";
import { commands } from "./commands";
import { closePalette } from "./palette-state";
import { PaletteList } from "./palette-list";
import { remember } from "./recent";
import s from "./palette.module.css";

export function Palette() {
  const open = useUi((u) => u.palOpen);
  return <AnimatePresence>{open && <PaletteBox />}</AnimatePresence>;
}

function PaletteBox() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  // the list is built on open and on each keystroke, not on every poll
  const items = useMemo(() => commands(q), [q]);
  const cur = Math.max(0, Math.min(sel, items.length - 1));
  const listRef = useRef<HTMLUListElement>(null);
  const run = (k: number) => { const x = items[k]; if (!x) return; remember(x.id); closePalette(false); x.run(); };
  const move = (dir: number) => { if (items.length) setSel((cur + dir + items.length) % items.length); };
  return (
    <motion.div className={s.pal} id="pal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fast}
      onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); closePalette(); } }}>
      <motion.div className={cx(s.box, glass)} role="dialog" aria-modal="true" aria-label="command palette" initial={{ y: -6 }} animate={{ y: 0 }} exit={{ y: -6 }} transition={T.base}>
        <input
          className={s.q} id="pal-q" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list"
          aria-activedescendant={items.length ? `pal-${cur}` : ""} placeholder="Go to a system, launch, stop, open logs…" spellCheck={false} autoComplete="off" autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
            else if (e.key === "Enter") { e.preventDefault(); run(cur); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); closePalette(); }
            else if (e.key === "Tab") e.preventDefault();
          }}
        />
        <PaletteList ref={listRef} items={items} q={q.trim().toLowerCase()} sel={cur} onHover={setSel} onRun={run} />
        <div className={s.foot}><span>↑↓ move</span><span>↵ run</span><span>esc close</span></div>
      </motion.div>
    </motion.div>
  );
}

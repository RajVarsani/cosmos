/** @jsxRuntime automatic @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import type { Frame, GalaxyBody } from "./types";
import { renderGalaxy } from "./render";
import { asciiOnly, reducedMotion } from "./env";
import { colorLevel, encodeLine } from "./ansi";

export type { GalaxyBody } from "./types";
export const GALAXY_EMPTY_TEXT = "no instances";
const FPS = 8;
// motion clock: each Ink redraw costs ~1-2 us per cell, so big terminals step slower; ticks between steps are no-ops
const stepHz = (w: number, h: number) => (w * h > 4000 ? 1 : 2);
const clock = (still: boolean, hz: number) => (still ? 0 : Math.floor((Date.now() / 1000) * hz) / hz);

type Props = { bodies: GalaxyBody[]; width: number; height: number; selectedId?: string };

type Drawn = { key: string; ansi: string[] };

const frameAt = (p: Props, t: number) => renderGalaxy({ ...p, t, ascii: asciiOnly(), emptyText: GALAXY_EMPTY_TEXT });
const encode = (f: Frame): Drawn => {
  const level = colorLevel();
  return { key: f.key, ansi: f.lines.map((l) => encodeLine(l, level)) };
};

export function GalaxyView(props: Props) {
  const { bodies, width, height, selectedId } = props;
  const still = reducedMotion();
  const latest = useRef(props);
  latest.current = props;
  const [frame, setFrame] = useState<Drawn>(() => encode(frameAt(props, clock(still, stepHz(width, height)))));
  const shown = useRef({ key: frame.key, t: clock(still, stepHz(width, height)), props });

  // one draw path: no-op until the clock steps or props change, no setState when the frame is unchanged
  const tick = () => {
    const p = latest.current, t = clock(still, stepHz(p.width, p.height));
    if (t === shown.current.t && p === shown.current.props) return;
    shown.current.t = t; shown.current.props = p;
    const f = frameAt(p, t);
    if (f.key === shown.current.key) return;
    shown.current.key = f.key;
    setFrame(encode(f));
  };
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => { tickRef.current(); }, [bodies, width, height, selectedId]);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => tickRef.current(), 1000 / FPS);
    return () => clearInterval(id);
  }, [still]);

  return (
    <Box flexDirection="column" width={width} height={height}>
      {frame.ansi.map((line, y) => (
        <Text key={y} wrap="truncate">{line}</Text>
      ))}
    </Box>
  );
}

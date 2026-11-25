import type { GalaxyModel } from "./model";

// the one live engine, so actions outside React can steer the camera
export type EngineApi = {
  init(host: HTMLElement): void;
  setModel(m: GalaxyModel): void;
  setLayout(ins: Insets, fly?: boolean): void;
  refocus(snap?: boolean): void;
  wake(): void;
  still(): void;
  birth(id: string): void;
  dispose(): void;
  savePose(): unknown;
  loadPose(p: unknown): void;
  hlSvc: string | null;
  ins?: Insets;
  sys: Map<string, any>;
  labelSizes: unknown;
  lab?: Map<string, HTMLElement & { _w?: number }>;
};
export type Insets = { r: number; b: number; avoid: number[][]; top: number };

export const Cz = {
  eng: null as EngineApi | null,
  m: null as GalaxyModel | null,
  ins: null as Insets | null,
  // camera pose and orbit phases, handed from one view to the next on a switch
  pose: null as unknown,
  rot: new Map<string, number>(),
  layout(ins: Insets, fly?: boolean) { this.ins = ins; this.eng?.setLayout(ins, fly); },
  refocus(snap?: boolean) { this.eng?.refocus(snap); },
  wake() { this.eng?.wake(); },
  still() { this.eng?.still(); },
};

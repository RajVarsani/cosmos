import { state } from "./core/state";
import { scene } from "./core/scene";
import { loop } from "./core/loop";
import { systems } from "./systems";
import { planets } from "./planets";
import { births, destroy } from "./particles";
import { blackHole } from "./black-hole";
import { protostar } from "./protostar";
import { camera } from "@/modules/scene/camera";
import { input } from "@/modules/scene/input";
import { frame } from "./frame";
import { labels } from "@/modules/scene/labels";
import type { Engine } from "@/modules/scene/types";

export type { Engine };

// one plain object, as the old G was: fresh state with every method group merged on
export function createEngine(): Engine {
  return Object.assign(state(), scene, loop, systems, planets, births, destroy, blackHole, protostar, camera, input, frame, labels);
}

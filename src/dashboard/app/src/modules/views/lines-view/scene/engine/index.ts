import { camera } from "@/modules/scene/camera";
import { input } from "@/modules/scene/input";
import { labels } from "@/modules/scene/labels";
import type { Engine } from "@/modules/scene/types";
import { state } from "./state";
import { scene } from "./scene";
import { loop } from "./loop";
import { pen } from "./pen";
import { model } from "./model";
import { frame } from "./frame";
import { arms } from "./draw/arms";
import { hole } from "./draw/hole";
import { system } from "./draw/system";
import { body } from "./draw/body";
import { next } from "./draw/next";

// the lines view: the galaxy's own camera, input and labels; this engine only renders, by hand, on one canvas
export function createLineEngine(): Engine {
  return Object.assign(state(), camera, input, labels, scene, loop, pen, model, frame, arms, hole, system, body, next);
}

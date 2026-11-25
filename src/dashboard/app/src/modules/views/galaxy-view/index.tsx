import { ViewRoot } from "../view-root";
import { WebGlScene } from "./scene";

// the dark WebGL galaxy
export function GalaxyView() {
  return <ViewRoot view="galaxy"><WebGlScene /></ViewRoot>;
}

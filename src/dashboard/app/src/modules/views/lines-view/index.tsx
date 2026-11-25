import { ViewRoot } from "../view-root";
import { LinesScene } from "./scene";

// the light paper view, drawn by hand on canvas 2D
export function LinesView() {
  return <ViewRoot view="lines"><LinesScene /></ViewRoot>;
}

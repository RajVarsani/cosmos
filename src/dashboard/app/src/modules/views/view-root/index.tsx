import type { ReactNode } from "react";
import { Dock } from "@/modules/dock";
import { Palette } from "@/modules/palette";
import { Sheet } from "@/modules/sheet";
import { Toast } from "@/modules/toast";
import { TopBar } from "@/modules/top-bar";
import { ViewToggle } from "@/modules/view-toggle";
import type { View } from "@/state/ui-store";
import "@/modules/scene/scene.css";
import s from "./view-root.module.css";

// one whole view: its scene, then the shared chrome, which takes its look only from the tokens this root sets
export function ViewRoot({ view, children }: { view: View; children: ReactNode }) {
  return (
    <div className={s.root} data-view={view}>
      {children}
      <TopBar />
      <ViewToggle />
      <Dock />
      <Sheet />
      <Palette />
      <Toast />
    </div>
  );
}

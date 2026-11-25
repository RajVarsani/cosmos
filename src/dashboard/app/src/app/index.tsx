import { MotionConfig } from "motion/react";
import { SWRConfig } from "swr";
import { useModelFeed } from "@/modules/scene/use-model-feed";
import { Views } from "@/modules/views";
import { useCatalog, useOverview } from "@/state/queries";
import { useBodySync } from "./use-body-sync";
import { useFirstData } from "./use-first-data";
import { useRouteSync } from "./use-route-sync";
import { useShortcuts } from "./use-shortcuts";
import { useViewport } from "./use-viewport";

function Shell() {
  useOverview();
  useCatalog();
  useBodySync();
  useFirstData();
  useRouteSync();
  useShortcuts();
  useViewport();
  useModelFeed();
  return <Views />;
}

export function App() {
  return (
    <SWRConfig value={{ revalidateOnReconnect: true }}>
      <MotionConfig reducedMotion="user">
        <Shell />
      </MotionConfig>
    </SWRConfig>
  );
}

import type { EngineApi, Insets } from "@/modules/scene/handle";

// `this` inside every method group: the public api plus the loose bag of scene state
export type Engine = EngineApi & { ins: Insets; [k: string]: any };
export const methods = <T extends object>(o: T & ThisType<Engine>) => o;

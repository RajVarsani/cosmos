import { gib } from "@/lib/format";
import { lbl } from "@/domain/states";
import { useUi } from "@/state/ui-store";

// the docker vm's memory, and what each instance holds of it
export function useMemory() {
  const vm = useUi((u) => u.data?.vm);
  const instances = useUi((u) => u.data?.instances);
  const catFloor = useUi((u) => u.cat?.vm?.floorMiB);
  if (!vm || "error" in vm && vm.error) return { state: vm && "error" in vm ? ("unreadable" as const) : ("measuring" as const) };
  const v = vm as Exclude<typeof vm, { error: string }>;
  const floor = v.floorMiB ?? catFloor ?? v.minBuildMiB;
  const used = v.totalMiB - v.availableMiB, pct = Math.max(0, Math.min(1, used / v.totalMiB)) * 100;
  const low = floor != null && v.availableMiB < floor, warn = !low && floor != null && v.availableMiB < floor * 1.5;
  const per = (instances || []).map((i) => [lbl(i), i.containers.reduce((a, c) => a + (c.memMiB || 0), 0)] as const).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
  return { state: "ok" as const, v, floor, used, pct, low, warn, per, label: `Memory: ${gib(v.availableMiB)} free` };
}
export type Memory = ReturnType<typeof useMemory>;

import { genericMutationFetcher } from "@/lib/api/fetchers";
import { Cz } from "@/modules/scene/handle";
import { actFollow } from "@/modules/sheet/activity/activity-store";
import { toast } from "@/modules/toast/toast-store";
import { closeDrawer, watchJob } from "@/state/actions";
import { refreshOverview } from "@/state/queries";
import { setUi, ui } from "@/state/ui-store";

// srcServices: the picked profile's source-mounted services; branches for any other service are dropped
export async function launch(srcServices: string[]) {
  const { backend, profile, name, branches, live } = ui().form;
  const picked = Object.fromEntries(Object.entries(branches).filter(([svc]) => srcServices.includes(svc)));
  const liveSvcs = live.filter((svc) => svc in picked);
  try {
    const r = await genericMutationFetcher("/api/instances", { arg: { type: "post", rest: [{ backend, profile: profile || undefined, name: name.trim() || undefined, branches: Object.keys(picked).length ? picked : undefined, live: liveSvcs.length ? liveSvcs : undefined }] } });
    const label = name.trim() || "a new system";
    setUi((s) => ({ form: { ...s.form, name: "", branches: {}, live: [] } }));
    (document.activeElement as HTMLElement | null)?.blur();
    watchJob(r.job, null);
    actFollow(r.job.id);
    toast(`launching ${label}`);
    closeDrawer();
    Cz.eng?.birth(r.job.id);
    refreshOverview();
  } catch (err) {
    toast((err as Error).message, true);
  }
}

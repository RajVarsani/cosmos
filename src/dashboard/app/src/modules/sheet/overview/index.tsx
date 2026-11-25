import { useFocused } from "../system-bar/use-focused";
import { PlanetView } from "../planet-view";
import { cx } from "@/modules/ui/glass";
import { InstanceSide } from "./instance-side";
import { ServiceTable } from "./service-table";
import s from "./overview.module.css";

// the system tab: the service table and instance side, or one planet's view
export function SystemPanel() {
  const f = useFocused();
  return (
    <div className={cx(s.root, !!f?.pc && s.planet)} id="sh-sys">
      {f && (f.pc ? <PlanetView key={f.pc.service} i={f.i} c={f.pc} /> : (
        <>
          <ServiceTable i={f.i} />
          <InstanceSide i={f.i} d={f.d} />
        </>
      ))}
    </div>
  );
}

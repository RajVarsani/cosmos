import { Field } from "../field";
import { note } from "@/modules/ui/cap";
import { BranchRow } from "./branch-row";
import s from "./branches-field.module.css";

// optional: a ref per source service for the new instance; unset rows stay on galaxy's pin
export function BranchesField({ step, services }: { step: number; services: string[] }) {
  return (
    <Field step={step} label="branches">
      <div className={s.rows}>{services.map((svc) => <BranchRow key={svc} svc={svc} />)}</div>
      <span className={note}>optional; a branch in an agent's worktree runs live from it, one your clone holds runs a copy unless you pick live</span>
    </Field>
  );
}

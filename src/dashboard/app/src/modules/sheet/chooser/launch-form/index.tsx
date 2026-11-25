import { useState, type FormEvent } from "react";
import { useUi } from "@/state/ui-store";
import { BackendPicker } from "../backend-picker";
import { BranchesField } from "../branches-field";
import { CatError, NoSlot } from "../cat-error";
import { cliLine } from "../cli";
import { Field } from "../field";
import { LaunchRow } from "../launch-row";
import { launch } from "../launch";
import { NameField } from "../name-field";
import { ProfilePicker } from "../profile-picker";
import { usePickForm } from "../use-pick-form";
import { CliLine } from "@/modules/ui/cli-line";
import s from "./launch-form.module.css";

export function LaunchForm() {
  const slot = useUi((st) => st.data?.nextSlot ?? null);
  const catErr = useUi((st) => st.catErr);
  const form = useUi((st) => st.form);
  const pf = usePickForm();
  const [busy, setBusy] = useState(false);
  if (slot == null) return <NoSlot />;
  if (!pf) return <CatError err={catErr} />;
  const { k, p, profile, backend } = pf;
  const local = p.backendKind === "local";
  const src = p.srcServices ?? [];
  const cur = backend ? k.combo(p.id, backend) : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    await launch(src);
    setBusy(false);
  };
  return (
    <form className={s.form} data-where="sheet" autoComplete="off" onSubmit={submit}>
      <Field className={s.pfld} step={1} label="profile"><ProfilePicker k={k} profile={profile} /></Field>
      <div className={s.nwr}>
        {!local && <Field step={2} label="backend"><BackendPicker k={k} p={p} backend={backend} /></Field>}
        <NameField step={local ? 2 : 3} />
        {!!src.length && <BranchesField step={local ? 3 : 4} services={src} />}
        <CliLine text={cliLine({ ...form, profile, backend }, k, src)} />
        <LaunchRow can={!!cur?.available} reason={cur?.reason} slot={slot} busy={busy} />
      </div>
    </form>
  );
}

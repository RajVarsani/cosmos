import { Field } from "../field";
import { TextInput } from "../text-input";
import { note } from "@/modules/ui/cap";
import { setUi, useUi } from "@/state/ui-store";
import { idPreview } from "./id-preview";

export function NameField({ step }: { step: number }) {
  const name = useUi((s) => s.form.name);
  const data = useUi((s) => s.data);
  return (
    <Field step={step} label="name">
      <TextInput name="name" value={name} placeholder="any name, or blank for a star" maxLength={60} onChange={(e) => setUi((s) => ({ form: { ...s.form, name: e.target.value } }))} />
      <span className={note}>{idPreview(name, data as Parameters<typeof idPreview>[1])}</span>
    </Field>
  );
}

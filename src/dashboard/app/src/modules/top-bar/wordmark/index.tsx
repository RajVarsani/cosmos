import { closeDrawer, focusSystem } from "@/state/actions";
import s from "./wordmark.module.css";

export function Wordmark() {
  return <button className={s.word} type="button" id="home" title="back to galaxy" onClick={() => { closeDrawer(); focusSystem(null); }}>Cosmos</button>;
}

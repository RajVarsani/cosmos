import { ui } from "./ui-store";

// deep links: #instance=<name>, &planet=<svc>, &logs
export const readRoute = () => {
  const p = new URLSearchParams(location.hash.slice(1));
  return { focus: p.get("instance") || null, planet: p.get("planet") || null, logs: p.has("logs") };
};
export function writeRoute() {
  const s = ui(), p: string[] = [];
  if (s.focus) p.push(`instance=${encodeURIComponent(s.focus)}`);
  if (s.focus && s.planet) p.push(`planet=${encodeURIComponent(s.planet)}`);
  if (s.logs) p.push("logs");
  const h = p.join("&");
  if (location.hash.slice(1) !== h) history.replaceState(null, "", h ? `#${h}` : location.pathname + location.search);
}

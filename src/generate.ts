import { join } from "path";
import { instancesDir } from "./paths";

export const instanceDir = (name: string) => join(instancesDir(), name);
export const overridePath = (name: string) => join(instanceDir(name), "compose.override.yml");
export const projectName = (name: string) => `cosmos-${name}`;
export const containerName = (name: string, svc: string) => `cosmos-${name}-${svc}`;
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

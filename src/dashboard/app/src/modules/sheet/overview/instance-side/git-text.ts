import { short } from "@/lib/format";
import type { Git } from "@/domain/types";

export const gitText = (g: Git) => `${g.branch ? g.branch : "detached"} @ ${short(g.sha)}${g.dirty ? ` · ${g.dirty} changed` : ""}`;

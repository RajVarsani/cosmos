import { appendFileSync } from "fs";
import { withState } from "../src/state";


const [iterations, holdMs] = Bun.argv.slice(2).map(Number);
for (let k = 0; k < iterations; k++) {
  await withState(async (s) => {
    appendFileSync(`${process.env.COSMOS_HOME}/trace`, `in ${performance.timeOrigin + performance.now()}\n`);
    (s as any).n = ((s as any).n ?? 0) + 1;
    if (holdMs) await Bun.sleep(holdMs);
    appendFileSync(`${process.env.COSMOS_HOME}/trace`, `out ${performance.timeOrigin + performance.now()}\n`);
  });
}

import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const WORKER = join(import.meta.dir, "lock-worker.ts");

// withState takes HOME/registry.lock and writes HOME/projects/<id>/.state/state.json
async function race(dir: string, procs: number, iterations: number, holdMs: number) {
  const project = mkdtempSync(join(tmpdir(), "cosmos-lock-project-"));
  writeFileSync(join(project, "cosmos.yaml"), "schemaVersion: 1\nprojectId: demo\n");
  const ps = Array.from({ length: procs }, () =>
    Bun.spawn(["bun", WORKER, String(iterations), String(holdMs)], { env: { ...process.env, COSMOS_HOME: dir, COSMOS_STATE_DIR: "", COSMOS_PROJECT: project }, stderr: "pipe" }),
  );
  const codes = await Promise.all(ps.map((p) => p.exited));
  const errs = await Promise.all(ps.map((p) => new Response(p.stderr).text()));
  expect(errs.join("")).toBe("");
  expect(codes).toEqual(Array(procs).fill(0));
  expect(JSON.parse(readFileSync(join(dir, "projects", "demo", ".state", "state.json"), "utf8")).n).toBe(procs * iterations);
  // strictly alternating in/out means no two holders overlapped
  const kinds = readFileSync(join(dir, "trace"), "utf8").trim().split("\n").map((l) => l.split(" ")).sort((a, b) => Number(a[1]) - Number(b[1])).map((e) => e[0]);
  kinds.forEach((k, i) => expect(k).toBe(i % 2 ? "out" : "in"));
  expect(readdirSync(dir).sort()).toEqual(["projects", "trace"]);
}

const scratch = () => mkdtempSync(join(tmpdir(), "cosmos-lock-"));

async function deadPid(): Promise<number> {
  const p = Bun.spawn(["true"]);
  await p.exited;
  return p.pid;
}

test("contention: 8 procs x 25 withState calls", () => race(scratch(), 8, 25, 0), 120_000);

test("stale lock held by a dead pid is broken exactly once", async () => {
  const dir = scratch();
  mkdirSync(join(dir, "registry.lock"));
  writeFileSync(join(dir, "registry.lock", "owner"), JSON.stringify({ pid: await deadPid(), at: Date.now() }));
  await race(dir, 6, 2, 50);
}, 120_000);

test("ownerless lock with an old mtime is broken", async () => {
  const dir = scratch();
  mkdirSync(join(dir, "registry.lock"));
  const old = new Date(Date.now() - 3_600_000);
  utimesSync(join(dir, "registry.lock"), old, old);
  await race(dir, 4, 2, 20);
}, 120_000);

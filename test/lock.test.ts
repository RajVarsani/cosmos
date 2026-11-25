import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const WORKER = join(import.meta.dir, "lock-worker.ts");

async function race(dir: string, procs: number, iterations: number, holdMs: number) {
  const ps = Array.from({ length: procs }, () =>
    Bun.spawn(["bun", WORKER, String(iterations), String(holdMs)], { env: { ...process.env, COSMOS_STATE_DIR: dir }, stderr: "pipe" }),
  );
  const codes = await Promise.all(ps.map((p) => p.exited));
  const errs = await Promise.all(ps.map((p) => new Response(p.stderr).text()));
  expect(errs.join("")).toBe("");
  expect(codes).toEqual(Array(procs).fill(0));
  expect(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")).n).toBe(procs * iterations);
  // strictly alternating in/out means no two holders overlapped
  const kinds = readFileSync(join(dir, "trace"), "utf8").trim().split("\n").map((l) => l.split(" ")).sort((a, b) => Number(a[1]) - Number(b[1])).map((e) => e[0]);
  kinds.forEach((k, i) => expect(k).toBe(i % 2 ? "out" : "in"));
  expect(readdirSync(dir).sort()).toEqual(["state.json", "trace"]);
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
  mkdirSync(join(dir, "lock"));
  writeFileSync(join(dir, "lock", "owner"), JSON.stringify({ pid: await deadPid(), at: Date.now() }));
  await race(dir, 6, 2, 50);
}, 120_000);

test("ownerless lock with an old mtime is broken", async () => {
  const dir = scratch();
  mkdirSync(join(dir, "lock"));
  const old = new Date(Date.now() - 3_600_000);
  utimesSync(join(dir, "lock"), old, old);
  await race(dir, 4, 2, 20);
}, 120_000);

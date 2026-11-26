import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { checkVersion, claimKey, foreignClaims, parseRegistry, reconcile } from "../src/registry";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const scratch = () => mkdtempSync(join(tmpdir(), "cosmos-reg-"));
const alive = (...ids: string[]) => (p: string) => ids.includes(p);
const claim = (projectId: string, instance: string, slot: number) => ({ projectId, instance, slot, at: "t" });

test("reconcile adds this project's instances and keeps other live projects", () => {
  const reg = { version: 1, claims: { [claimKey("b", "x")]: claim("b", "x", 2) } };
  const next = reconcile(reg, "a", [{ name: "vega", slot: 1 }], alive("a", "b"), "now")!;
  expect(Object.keys(next.claims).sort()).toEqual(["a/vega", "b/x"]);
  expect(next.claims["a/vega"]).toEqual({ projectId: "a", instance: "vega", slot: 1, at: "now" });
  expect(foreignClaims(next, "a").map((c) => c.instance)).toEqual(["x"]);
});

test("reconcile frees removed instances and returns null when nothing changed", () => {
  const reg = { version: 1, claims: { "a/vega": claim("a", "vega", 1), "a/rigel": claim("a", "rigel", 2) } };
  const next = reconcile(reg, "a", [{ name: "vega", slot: 1 }], alive("a"))!;
  expect(Object.keys(next.claims)).toEqual(["a/vega"]);
  expect(reconcile(next, "a", [{ name: "vega", slot: 1 }], alive("a"))).toBeNull();
});

test("reconcile drops claims of projects whose state is gone", () => {
  const reg = { version: 1, claims: { "gone/x": claim("gone", "x", 3) } };
  expect(Object.keys(reconcile(reg, "a", [], alive("a"))!.claims)).toEqual([]);
});

test("reconcile keeps fields it does not know (additive-only)", () => {
  const reg = { version: 1, future: { keep: true }, claims: {} };
  expect(reconcile(reg, "a", [{ name: "vega", slot: 1 }], alive("a"))!.future).toEqual({ keep: true });
});

test("a newer registry or state version is refused with an upgrade hint", () => {
  expect(() => parseRegistry(JSON.stringify({ version: 2, claims: {} }), "f")).toThrow(/version 2; this cosmos reads version 1.*@latest/);
  expect(() => checkVersion("state", "f", 2, 1)).toThrow(/state version 2/);
  expect(() => checkVersion("state", "f", undefined, 1)).toThrow(/missing or invalid/);
  expect(parseRegistry(JSON.stringify({ version: 1 })).claims).toEqual({});
});

function project(manifestExtra = "") {
  const dir = scratch();
  writeFileSync(join(dir, "cosmos.yaml"), `schemaVersion: 1\nprojectId: demo\n${manifestExtra}`);
  return dir;
}
const run = async (dir: string, home: string, ...args: string[]) => {
  const p = Bun.spawn(["bun", CLI, ...args], { cwd: dir, env: { ...process.env, COSMOS_HOME: home, COSMOS_STATE_DIR: "", COSMOS_PROJECT: dir }, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, out, err };
};

test("manifest cosmos range: unmet range is refused, met range loads", async () => {
  const home = scratch();
  const bad = await run(project('cosmos: ">=99.0.0"\n'), home, "ls");
  expect(bad.err).toMatch(/needs cosmos >=99\.0\.0; installed \d+\.\d+\.\d+/);
  expect(bad.code).not.toBe(0);
  const ok = await run(project('cosmos: ">=0.2.0"\n'), home, "ls");
  expect(ok.err).not.toMatch(/needs cosmos/);
});

test("state lives under projects/<projectId>; a newer state file is refused", async () => {
  const home = scratch();
  const dir = project();
  const stateDir = join(home, "projects", "demo", ".state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "state.json"), JSON.stringify({ version: 2, instances: {} }));
  const r = await run(dir, home, "ls");
  expect(r.err).toMatch(/state version 2; this cosmos reads version 1/);
});

test("0.1 state with instances is refused with the migration steps; an empty one is ignored", async () => {
  const home = scratch();
  const dir = project();
  mkdirSync(join(home, ".state"), { recursive: true });
  writeFileSync(join(home, ".state", "state.json"), JSON.stringify({ version: 1, instances: { vega: { name: "vega" } } }));
  const r = await run(dir, home, "ls");
  expect(r.err).toMatch(/1 instance\(s\) from cosmos 0\.1.*cosmos rm <name>/);
  writeFileSync(join(home, ".state", "state.json"), JSON.stringify({ version: 1, instances: {} }));
  expect((await run(dir, home, "ls")).err).not.toMatch(/from cosmos 0\.1/);
});

test("another project's claim reserves its slot and name", async () => {
  const home = scratch();
  mkdirSync(join(home, ".state"), { recursive: true });
  writeFileSync(join(home, ".state", "registry.json"), JSON.stringify({ version: 1, claims: { "other/vega": claim("other", "vega", 1) } }));
  const { readFileSync: _r } = await import("fs");
  const mod = await Bun.spawn(
    ["bun", "-e", `import { readState, usedSlots, reservedNames } from "${join(import.meta.dir, "..", "src", "state.ts")}"; const s = readState(); console.log(JSON.stringify({ slots: [...usedSlots(s)], names: reservedNames(s) }))`],
    { cwd: project(), env: { ...process.env, COSMOS_HOME: home, COSMOS_STATE_DIR: "", COSMOS_PROJECT: process.cwd() }, stdout: "pipe", stderr: "pipe" },
  );
  void mod;
});

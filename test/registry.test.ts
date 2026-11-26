import { expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { checkVersion, claimKey, foreignClaims, parseRegistry, reapable, reconcile, type Claim } from "../src/registry";
import { checkWriter } from "../src/state";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");
const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), "cosmos-reg-")));
const claim = (projectId: string, instance: string, slot: number, extra: Partial<Claim> = {}): Claim => ({ projectId, projectDir: `/p/${projectId}`, instance, slot, prefix: `cosmos-${instance}`, pid: 1, at: "t", ...extra });
const A = { id: "a", dir: "/p/a" };

test("reconcile adds this project's instances and never touches another project's claims", () => {
  const reg = { version: 1, claims: { [claimKey("b", "x")]: claim("b", "x", 2) } };
  const next = reconcile(reg, A, [{ name: "vega", slot: 1, owner: { pid: 7 }, shareName: { name: "z1" } }], "now")!;
  expect(Object.keys(next.claims).sort()).toEqual(["a/vega", "b/x"]);
  expect(next.claims["a/vega"]).toEqual({ projectId: "a", projectDir: "/p/a", instance: "vega", slot: 1, prefix: "cosmos-vega", pid: 7, zrok: ["z1"], at: "now" });
  expect(foreignClaims(next, "a").map((c) => c.instance)).toEqual(["x"]);
  // a project with no instances left only drops its own claims
  expect(Object.keys(reconcile(next, A, [])!.claims)).toEqual(["b/x"]);
});

test("reconcile frees removed instances, follows slot changes and returns null when nothing changed", () => {
  const reg = { version: 1, claims: { "a/vega": claim("a", "vega", 1), "a/rigel": claim("a", "rigel", 2) } };
  const next = reconcile(reg, A, [{ name: "vega", slot: 1, owner: { pid: 1 } }])!;
  expect(Object.keys(next.claims)).toEqual(["a/vega"]);
  expect(reconcile(next, A, [{ name: "vega", slot: 1, owner: { pid: 1 } }])).toBeNull();
  expect(reconcile(next, A, [{ name: "vega", slot: 3, owner: { pid: 1 } }])!.claims["a/vega"].slot).toBe(3);
});

test("reconcile keeps fields it does not know (additive-only)", () => {
  const reg = { version: 1, future: { keep: true }, claims: { "a/vega": claim("a", "vega", 1, { labels: "x" }) } };
  const next = reconcile(reg, A, [{ name: "vega", slot: 2, owner: { pid: 1 } }])!;
  expect(next.future).toEqual({ keep: true });
  expect(next.claims["a/vega"].labels).toBe("x");
});

test("reapable: only other projects, only when the checkout is gone or containers and record are both gone", () => {
  const reg = { version: 1, claims: { "a/v": claim("a", "v", 1), "b/gone": claim("b", "gone", 2), "c/idle": claim("c", "idle", 3), "c/down": claim("c", "down", 4), "d/x": claim("d", "x", 5) } };
  const dead = reapable(reg, "a", {
    projectGone: (c) => c.projectId === "b" || c.projectId === "a",
    containersGone: (c) => c.projectId !== "d",
    stateLists: (c) => (c.projectId === "d" ? null : c.instance === "down"),
  });
  expect(dead.map((d) => d.key).sort()).toEqual(["b/gone", "c/idle"]);
});

test("a newer registry, state version or state writer is refused with an upgrade hint", () => {
  expect(() => parseRegistry(JSON.stringify({ version: 2, claims: {} }), "f")).toThrow(/version 2; this cosmos reads version 1.*@latest/);
  expect(() => checkVersion("state", "f", 2, 1)).toThrow(/state version 2/);
  expect(() => checkVersion("state", "f", undefined, 1)).toThrow(/missing or invalid/);
  expect(parseRegistry(JSON.stringify({ version: 1 })).claims).toEqual({});
  expect(() => checkWriter("f", "0.3.0", "0.2.0")).toThrow(/written by cosmos 0\.3\.0; this is 0\.2\.0.*@\^0\.3\.0/);
  expect(() => checkWriter("f", "0.2.9", "0.2.0")).not.toThrow();
  expect(() => checkWriter("f", "0.1.1", "0.2.0")).not.toThrow();
  expect(() => checkWriter("f", undefined, "0.2.0")).not.toThrow();
});

// ---------- through the CLI, in a scratch home ----------

const MANIFEST = (id: string, extra = "") => `schemaVersion: 1
projectId: ${id}
${extra}services:
  web: { kind: fe, offset: 1, containerPort: 3000, estMiB: 10 }
backends:
  stage: { kind: remote }
profiles:
  fe:
    backend: remote
    default: true
    services: [web]
`;

function project(id = "demo", extra = "") {
  const dir = scratch();
  writeFileSync(join(dir, "cosmos.yaml"), MANIFEST(id, extra));
  return dir;
}
const env = (dir: string, home: string) => {
  const e: Record<string, string | undefined> = { ...process.env, COSMOS_HOME: home, COSMOS_PROJECT: dir };
  delete e.COSMOS_STATE_DIR;
  return e;
};
const cli = async (dir: string, home: string, ...args: string[]) => {
  const p = Bun.spawn(["bun", CLI, ...args], { cwd: dir, env: env(dir, home), stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  return { code: await p.exited, out, err };
};
const evalIn = async (dir: string, home: string, code: string) => {
  const p = Bun.spawn(["bun", "-e", code], { cwd: dir, env: env(dir, home), stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  if ((await p.exited) !== 0) throw new Error(err);
  return out;
};
const SRC = join(import.meta.dir, "..", "src");

test("manifest guards: unmet cosmos range and newer schemaVersion are refused with an upgrade hint", async () => {
  const home = scratch();
  const bad = await cli(project("demo", 'cosmos: ">=99.0.0"\n'), home, "ls");
  expect(bad.err).toMatch(/needs cosmos >=99\.0\.0; installed \d+\.\d+\.\d+/);
  expect(bad.code).not.toBe(0);
  const ok = await cli(project("demo", 'cosmos: ">=0.2.0"\n'), home, "ls");
  expect(ok.err).toBe("");
  expect(ok.code).toBe(0);
  const dir = scratch();
  writeFileSync(join(dir, "cosmos.yaml"), MANIFEST("demo").replace("schemaVersion: 1", "schemaVersion: 2"));
  expect((await cli(dir, home, "ls")).err).toMatch(/schemaVersion 2 is newer.*@latest/);
});

test("state lives under projects/<projectId>; a newer state file is refused", async () => {
  const home = scratch();
  const stateDir = join(home, "projects", "demo", ".state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "state.json"), JSON.stringify({ version: 2, instances: {} }));
  expect((await cli(project(), home, "ls")).err).toMatch(/state version 2; this cosmos reads version 1/);
  writeFileSync(join(stateDir, "state.json"), JSON.stringify({ version: 1, writtenBy: "9.0.0", instances: {} }));
  expect((await cli(project(), home, "ls")).err).toMatch(/written by cosmos 9\.0\.0/);
});

const inst = (name: string, slot: number, home: string, services = ["web"]) => ({
  name, slot, backend: "stage", profile: "fe", services, ports: { web: 20001 + 100 * slot }, image: "x",
  src: { web: join(home, "instances", name, "src", "web") }, owner: { cwd: "/", sessionId: null, pid: 1 }, createdAt: "t", lastUsed: "t",
});

test("0.1 layout migrates on first run: records, dirs, paths, symlinks, foreign leftovers kept and reserved; idempotent", async () => {
  const home = scratch();
  const dir = project();
  mkdirSync(join(home, ".state", "shares"), { recursive: true });
  mkdirSync(join(home, "instances", "vega", "src", "web"), { recursive: true });
  writeFileSync(join(home, "instances", "vega", "compose.override.yml"), `services:\n  web:\n    volumes: [{"type":"bind","source":"${home}/instances/vega/src/web","target":"/app"}]\n    env_file: ["${home}/envs/web/.env"]\n`);
  mkdirSync(join(home, "envs", "web"), { recursive: true });
  writeFileSync(join(home, "envs", "web", ".env"), "A=1\n");
  writeFileSync(join(home, ".state", "shares", "vega.json"), JSON.stringify({ statusFile: `${home}/.state/shares/vega.status.json`, auth: { password: "p" } }));
  const foreign = inst("orion", 2, home, ["api"]);
  writeFileSync(join(home, ".state", "state.json"), JSON.stringify({ version: 1, instances: { vega: inst("vega", 1, home), orion: foreign }, pendingRelease: ["zz"] }));
  writeFileSync(join(dir, "cosmos.yaml"), MANIFEST("demo").replace("services:\n", "envSources:\n  web: [envs]\nservices:\n"));

  const r = await cli(dir, home, "ls", "--json");
  expect(r.code).toBe(0);
  expect(r.err).toMatch(/migrated 1 instance\(s\) \(vega\)/);
  const ph = join(home, "projects", "demo");
  const st = JSON.parse(readFileSync(join(ph, ".state", "state.json"), "utf8"));
  expect(Object.keys(st.instances)).toEqual(["vega"]);
  expect(st.instances.vega.src.web).toBe(join(ph, "instances", "vega", "src", "web"));
  expect(st.pendingRelease).toEqual(["zz"]);
  expect(st.writtenBy).toMatch(/^\d+\.\d+\.\d+/);
  // dirs moved, old paths are symlinks to the new ones
  expect(lstatSync(join(home, "instances", "vega")).isSymbolicLink()).toBe(true);
  expect(readlinkSync(join(home, "instances", "vega"))).toBe(join(ph, "instances", "vega"));
  expect(readlinkSync(join(home, "envs", "web"))).toBe(join(ph, "envs", "web"));
  const ov = readFileSync(join(ph, "instances", "vega", "compose.override.yml"), "utf8");
  expect(ov).toContain(`${ph}/instances/vega/src/web`);
  expect(ov).toContain(`${ph}/envs/web/.env`);
  expect(ov).not.toContain(`${home}/instances/`);
  expect(JSON.parse(readFileSync(join(ph, ".state", "shares", "vega.json"), "utf8")).statusFile).toBe(`${ph}/.state/shares/vega.status.json`);
  // the other project's instance stays in the 0.1 file and its slot and name stay taken
  expect(Object.keys(JSON.parse(readFileSync(join(home, ".state", "state.json"), "utf8")).instances)).toEqual(["orion"]);
  const reg = JSON.parse(readFileSync(join(home, "registry.json"), "utf8"));
  expect(reg.claims["demo/vega"]).toMatchObject({ projectId: "demo", projectDir: dir, slot: 1, prefix: "cosmos-vega" });
  const m = JSON.parse(await evalIn(dir, home, `import { readState, usedSlots, reservedNames } from "${SRC}/state.ts"; const s = readState(); console.log(JSON.stringify({ slots: [...usedSlots(s)].sort(), names: reservedNames(s) }))`));
  expect(m).toEqual({ slots: [1, 2], names: ["orion"] });
  // second run: nothing left to do
  const again = await cli(dir, home, "ls");
  expect(again.err).not.toMatch(/migrat/);
  // once nothing is left, the 0.1 file is kept as state.json.migrated
  writeFileSync(join(home, ".state", "state.json"), JSON.stringify({ version: 1, instances: {} }));
  await cli(dir, home, "ls");
  expect(existsSync(join(home, ".state", "state.json"))).toBe(false);
  expect(existsSync(join(home, ".state", "state.json.migrated"))).toBe(true);
});

test("another project's claim reserves its slot and name, and an explicit name it holds is refused", async () => {
  const home = scratch();
  writeFileSync(join(home, "registry.json"), JSON.stringify({ version: 1, claims: { "other/vega": claim("other", "vega", 1) } }));
  const dir = project();
  const m = JSON.parse(await evalIn(dir, home, `import { readState, slotCandidates, reservedNames } from "${SRC}/state.ts"; const s = readState(); console.log(JSON.stringify({ first: slotCandidates(s)[0], names: reservedNames(s) }))`));
  expect(m).toEqual({ first: 2, names: ["vega"] });
  for (const a of [["init", "-q"], ["add", "."], ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x"]]) Bun.spawnSync(["git", "-C", dir, ...a]);
  const up = await cli(dir, home, "up", "--backend", "stage", "--name", "vega", "--skip-doctor");
  expect(up.err).toMatch(/instance name vega is held by another project/);
});

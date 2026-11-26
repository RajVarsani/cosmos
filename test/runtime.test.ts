import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { colimaMounts } from "../src/runtime/providers/colima";
import { parseRuntimeSpec, RuntimeConfigError, selectRuntime } from "../src/runtime/select";
import { currentEndpoint } from "../src/runtime";
import type { Provider, RuntimeId } from "../src/runtime/types";

// fake providers with fixed sockets; colima-like profiles under /c/<profile>/docker.sock
const fake = (id: RuntimeId, socks: string[], profiles = false): Provider => ({
  id,
  sockets: (p) => (profiles && p ? [`/c/${p}/docker.sock`] : socks),
  profileOf: (s) => (profiles ? s.match(/^\/c\/([^/]+)\/docker\.sock$/)?.[1] ?? null : null),
  create: () => {
    throw new Error("unused");
  },
});
const providers = [fake("docker-desktop", ["/dd/docker.sock"]), fake("orbstack", ["/orb/docker.sock"]), fake("colima", ["/c/default/docker.sock", "/c/cosmos-test/docker.sock"], true)];
const sel = (o: { env?: string; local?: unknown; endpoint?: string | null; live?: string[]; links?: Record<string, string> }) =>
  selectRuntime({
    envSpec: o.env,
    localSpec: o.local,
    endpoint: o.endpoint ?? null,
    providers,
    exists: (p) => (o.live ?? []).includes(p),
    realpath: (p) => o.links?.[p] ?? p,
  });

test("parseRuntimeSpec: names, profiles, auto, object form", () => {
  expect(parseRuntimeSpec(undefined, "x")).toBeNull();
  expect(parseRuntimeSpec("auto", "x")).toBeNull();
  expect(parseRuntimeSpec("colima", "x")).toEqual({ id: "colima", profile: null });
  expect(parseRuntimeSpec("colima:cosmos-test", "x")).toEqual({ id: "colima", profile: "cosmos-test" });
  expect(parseRuntimeSpec({ name: "orbstack" }, "x")).toEqual({ id: "orbstack", profile: null });
  expect(() => parseRuntimeSpec("podman", "COSMOS_RUNTIME")).toThrow(RuntimeConfigError);
  expect(() => parseRuntimeSpec("colima:bad/profile", "x")).toThrow(/bad runtime profile/);
});

test("COSMOS_RUNTIME beats cosmos.local.yaml beats the docker context", () => {
  const live = ["/dd/docker.sock", "/orb/docker.sock", "/c/default/docker.sock"];
  expect(sel({ env: "orbstack", local: "colima", endpoint: "unix:///dd/docker.sock", live })).toMatchObject({ id: "orbstack", source: "COSMOS_RUNTIME", endpoint: "unix:///orb/docker.sock" });
  expect(sel({ local: "colima", endpoint: "unix:///dd/docker.sock", live })).toMatchObject({ id: "colima", source: "cosmos.local.yaml", profile: "default", endpoint: "unix:///c/default/docker.sock" });
  expect(sel({ endpoint: "unix:///orb/docker.sock", live })).toMatchObject({ id: "orbstack", source: "docker context" });
});

test("auto-detect follows the context endpoint, through symlinks, with the colima profile", () => {
  expect(sel({ endpoint: "unix:///var/run/docker.sock", links: { "/var/run/docker.sock": "/dd/docker.sock" } })).toMatchObject({ id: "docker-desktop", source: "docker context", endpoint: "unix:///var/run/docker.sock" });
  expect(sel({ endpoint: "unix:///c/cosmos-test/docker.sock" })).toMatchObject({ id: "colima", profile: "cosmos-test", source: "docker context" });
});

test("auto-detect falls back to the first live socket, then to docker-desktop on the CLI default", () => {
  expect(sel({ endpoint: "tcp://remote:2375", live: ["/orb/docker.sock", "/c/default/docker.sock"] })).toMatchObject({ id: "orbstack", source: "socket" });
  expect(sel({ endpoint: null, live: ["/c/cosmos-test/docker.sock"] })).toMatchObject({ id: "colima", profile: "cosmos-test", source: "socket" });
  expect(sel({ endpoint: "tcp://remote:2375" })).toEqual({ id: "docker-desktop", profile: null, source: "fallback", endpoint: "tcp://remote:2375" });
});

test("explicit colima without a profile picks the live one; a named profile wins over the context", () => {
  // only the non-default profile runs: COSMOS_RUNTIME=colima finds it, never the default context's engine
  expect(sel({ env: "colima", endpoint: "unix:///dd/docker.sock", live: ["/dd/docker.sock", "/c/cosmos-test/docker.sock"] })).toMatchObject({ id: "colima", profile: "cosmos-test", endpoint: "unix:///c/cosmos-test/docker.sock" });
  expect(sel({ env: "colima:cosmos-test", endpoint: "unix:///c/default/docker.sock", live: ["/c/default/docker.sock", "/c/cosmos-test/docker.sock"] })).toMatchObject({ profile: "cosmos-test", endpoint: "unix:///c/cosmos-test/docker.sock" });
  // context already on that colima profile: keep its endpoint
  expect(sel({ env: "colima", endpoint: "unix:///c/default/docker.sock", live: ["/c/default/docker.sock"] })).toMatchObject({ profile: "default", endpoint: "unix:///c/default/docker.sock" });
  // named but not running: no endpoint, so the docker call fails with the engine's own error and doctor names the start command
  expect(sel({ env: "colima:nope", live: [] })).toMatchObject({ id: "colima", profile: "nope", endpoint: null });
});

test("currentEndpoint: DOCKER_HOST, then DOCKER_CONTEXT / currentContext via the context meta store", () => {
  const cfg = mkdtempSync(join(tmpdir(), "cosmos-rt-"));
  const hash = new Bun.CryptoHasher("sha256").update("colima-x").digest("hex");
  mkdirSync(join(cfg, "contexts", "meta", hash), { recursive: true });
  writeFileSync(join(cfg, "contexts", "meta", hash, "meta.json"), JSON.stringify({ Name: "colima-x", Endpoints: { docker: { Host: "unix:///c/x/docker.sock" } } }));
  writeFileSync(join(cfg, "config.json"), JSON.stringify({ currentContext: "colima-x" }));
  expect(currentEndpoint({ DOCKER_HOST: "unix:///h.sock", DOCKER_CONFIG: cfg })).toBe("unix:///h.sock");
  expect(currentEndpoint({ DOCKER_CONFIG: cfg })).toBe("unix:///c/x/docker.sock");
  expect(currentEndpoint({ DOCKER_CONFIG: cfg, DOCKER_CONTEXT: "default" })).toBe("unix:///var/run/docker.sock");
  expect(currentEndpoint({ DOCKER_CONFIG: cfg, DOCKER_CONTEXT: "missing" })).toBeNull();
});

test("colimaMounts: default ~ and /tmp/colima, else the listed locations", () => {
  expect(colimaMounts({}).length).toBe(2);
  expect(colimaMounts({ mounts: [] })[1]).toBe("/tmp/colima");
  expect(colimaMounts({ mounts: [{ location: "/Volumes/src", writable: true }, "/opt/x:w"] })).toEqual(["/Volumes/src", "/opt/x"]);
});

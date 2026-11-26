// Loads the project's adapter (manifest `adapter:`) once and builds the context its hooks receive.
import { join } from "path";
import type { Adapter, AdapterContext } from "./api";
import { adapterPath, composeFile, extraDir, findBackend, loginConfig, manifest, srcSvc, svcDef, vendorDir, vendorSvcDir } from "./catalog";
import { compose, containerProcs, containerState, cosmosContainers, volumeExists } from "./docker";
import { copyMissing, parseDotenv } from "./envfile";
import { CosmosError } from "./errors";
import { containerName, instanceDir } from "./generate";
import { hostPort } from "./offsets";
import { HOME, PKG_ROOT, envsDir, projectDir, projectStateDir } from "./paths";
import { waitHttp, workers } from "./probe";
import { runtimeInfo } from "./runtime";
import { GIT_ENV, run } from "./sh";
import { composeBuildSpec, composeDoc, extraBuildSpec, gitHead, goAirSpec, h12, rewriteLocalPorts, writeEnvFile } from "./stack";
import { ensureServiceSources, pinnedSha } from "./vendor";

let loaded: { path: string | null; adapter: Adapter } | null = null;

export async function loadAdapter(): Promise<Adapter> {
  const path = adapterPath();
  if (loaded && loaded.path === path) return loaded.adapter;
  let adapter: Adapter = {};
  if (path) {
    let mod: any;
    try {
      mod = await import(path);
    } catch (e) {
      throw new CosmosError(`could not load the adapter ${path}: ${(e as Error).message}`);
    }
    adapter = (mod.default ?? mod.adapter ?? {}) as Adapter;
    if (typeof adapter !== "object") throw new CosmosError(`${path} must export an adapter object (export default { ... })`);
  }
  loaded = { path, adapter };
  return adapter;
}

// the loaded adapter, or none: callers run loadAdapter() first (the CLI and dashboard do)
export const A = (): Adapter => loaded?.adapter ?? {};

let context: AdapterContext | null = null;

export function ctx(): AdapterContext {
  if (context && context.project.dir === projectDir() && context.project.manifest === manifest()) return context;
  const m = manifest();
  context = {
    project: { dir: projectDir(), id: m.projectId, manifest: m },
    paths: {
      pkgRoot: PKG_ROOT, home: HOME, stateDir: projectStateDir(), envsDir: envsDir(), vendorDir: vendorDir(), composeFile: composeFile(),
      vendorSvcDir, extraDir, instanceDir, envDir: (b: string) => join(envsDir(), b),
    },
    log: (msg: string) => console.error(`[cosmos] ${msg}`),
    run, GIT_ENV, parseDotenv, writeEnvFile, copyMissing: (from, to, filter) => copyMissing(from, to, filter),
    svcDef, srcSvc, findBackend, login: loginConfig, hostPort, rewriteLocalPorts,
    composeDoc, compose, containerName, containerState, containerProcs, cosmosContainers, volumeExists,
    specs: { compose: composeBuildSpec, goAir: goAirSpec, extra: extraBuildSpec },
    hash: h12, gitHead, pinnedSha, ensureServiceSources, waitHttp, workers,
    error: (message, detail) => new CosmosError(message, detail),
    runtime: runtimeInfo(),
  };
  return context;
}

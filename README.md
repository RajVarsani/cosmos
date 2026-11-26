# cosmos

Isolated instances of a project's docker compose stack on one machine: one slot of ports per instance, a git
worktree per source-mounted service, a Caddy edge for remote backends, zrok shares and a web dashboard.

## Install

Requires Bun 1.3 or newer and one supported container runtime: Docker Desktop, Colima or OrbStack (see
[Container runtimes](#container-runtimes)).

Install once per user. A project needs only `cosmos.yaml` at its root (see [Project contract](#project-contract)):
no cosmos dependency, no adapter code, no cosmos-only Dockerfiles.

```
bun add -g @rajvarsani/cosmos
cosmos doctor                                         # checks bun, the runtime, the project, git access, ports
cosmos up --backend <backend> --profile <profile> --name "My Work"
cosmos dashboard                                      # http://127.0.0.1:20000
```

cosmos finds `cosmos.yaml` in the working dir or the nearest one above it (or `--project <dir>`). `up` runs
`doctor` itself on the first run on a machine. `cosmos --help` lists every command.

## Container runtimes

| Runtime | Select | Engine socket | Host alias in containers | Notes |
| --- | --- | --- | --- | --- |
| `docker-desktop` | `COSMOS_RUNTIME=docker-desktop` | `~/.docker/run/docker.sock` | `host.docker.internal` (built in) | memory and CPUs in Settings > Resources |
| `colima` | `COSMOS_RUNTIME=colima` or `colima:<profile>` | `~/.colima/<profile>/docker.sock` | `host.docker.internal` (cosmos adds `extra_hosts: host-gateway`) | needs the compose and buildx CLI plugins; binds only under the VM's mounts (default `~`); polls for file changes unless `mountInotify: true` |
| `orbstack` | `COSMOS_RUNTIME=orbstack` | `~/.orbstack/run/docker.sock` | `host.docker.internal` (built in) | |

Order: `COSMOS_RUNTIME`, then `runtime:` in `COSMOS_HOME/cosmos.local.yaml` (same values, or `auto`), then the
runtime that owns the engine the current docker context (or `DOCKER_HOST`) points at, then the first runtime whose
socket exists. An engine no runtime owns (tcp, ssh, another socket) is used as is with Docker Desktop defaults. A
named runtime that is not running gets its own socket anyway, so calls fail rather than reach another engine.
Every docker and compose call carries the socket as `DOCKER_HOST`; cosmos never runs `docker context use`.
`cosmos doctor` prints the pick and the runtime's own checks.

## Roots

| Root | Found by | Holds |
| --- | --- | --- |
| package | where it is installed | code, `docker/go-air.Dockerfile`, the prebuilt dashboard |
| project | `--project <dir>`, `COSMOS_PROJECT`, or the nearest dir upward with `cosmos.yaml` | `cosmos.yaml`, the compose file and its Dockerfiles |
| home | `COSMOS_HOME` (default `~/.cosmos`) | the machine registry and one dir per project (see State layout) |

`vendor/<projectId>` is a detached worktree of the project at its HEAD; cosmos moves it when HEAD moves and no
instance is running.

## State layout

| Path under `COSMOS_HOME` | Scope | Holds | Compatibility |
| --- | --- | --- | --- |
| `registry.json`, `registry.lock` | machine | one claim per instance: projectId, project dir, slot, container prefix, owner pid, zrok names | additive only; writers keep unknown fields; a newer `version` is refused |
| `.state/` | machine | docker build lock, dashboard pid and log, doctor marker | |
| `cosmos.local.yaml` | machine | local overrides (env sources, share limits, `runtime`) | |
| `projects/<projectId>/.state/state.json` | project | instance records, stamped `version` and `writtenBy` | refused when written by a cosmos outside this one's caret range |
| `projects/<projectId>/.state/{shares,failures,ops,git}`, `measure.json` | project | share configs and logs, failure logs, locks, image memory | |
| `projects/<projectId>/{instances,envs,vendor}` | project | per-instance worktrees and overrides, env copies, vendored worktrees | |
| `projects/<projectId>/cosmos.local.yaml` | project | overrides on top of the machine file | |

`cosmos.yaml` may pin `cosmos: ">=0.5.0"`; a newer `schemaVersion` or an unmet range is refused with the upgrade
command. A 0.1 layout (`.state/state.json`, `instances/`, `envs/`, `vendor/`) is migrated on the first command in a
project: its instances and dirs move, old paths become symlinks, and `.state/state.json` is kept as
`state.json.migrated`. `cosmos doctor` reaps claims whose project dir is gone, or whose containers and record are gone.

## Project contract

`cosmos.yaml` is the whole contract. The project's own compose file and Dockerfiles own its infra (dev image
targets, init jobs, local stand-ins) and plain `docker compose up` keeps working without cosmos. cosmos core never
names a project's services; everything below is data. Templates: `{{port.<svc>}}`, `{{origins}}` (the instance's
browser origins), `{{login.<field>}}`, `{{vars.<name>}}`, `{{env.<bundle>}}` (the env copy dir), `{{dir}}` (the
instance dir), `{{instance}}`, `{{layout.<name>}}`. An `if:` takes service names and `local`, `remote`, `poll`;
all must hold and `!x` negates.

| Key | Holds |
| --- | --- |
| `schemaVersion`, `cosmos`, `projectId`, `compose`, `sourcesDir`, `network` | identity, the minimum cosmos (semver range), the compose file, where submodules live |
| `composeEnvFiles`, `envSources` | env bundles: `{from: [dirs], include: [globs]}` per bundle, copied into the home; `cosmos.local.yaml` overrides `from` |
| `vars` | per-backend values read from a service's source: `{service, file, match}` (first capture; `{{vars.x}}` in `match` is the backend's) |
| `requires` | `{local, remote}` lists of `{file, fix}`: a backend kind is available when they exist; drives the catalog and `doctor` |
| `backendHost` | `{file, key}`: the deployed host a remote backend's FE calls, for the catalog |
| `secrets` | `{service, file, keys, command, fix}`: keys an env file lacks, read from a command's JSON output and appended (local stacks) |
| `services.<svc>` | kind, offset, containerPort, health, srcMount, go, workers, origin, remote, ready, url, uses, repo, extra, dependsOn, calledBy (as before), plus the keys below |
| `services.<svc>.env` | environment merged over the compose service's; a value is a template or `{value, if, else}` |
| `services.<svc>.volumes`, `.command` | compose short-syntax volumes added (anonymous ones become per-instance volumes keyed on the image), the command replaced |
| `services.<svc>.layouts` | `[{when: <file in the checkout>, vars}]`: the first match gives `{{layout.*}}` (a repo with two layouts) |
| `services.<svc>.image` | `{hashFiles, shared}`: tag keyed on file contents (`a\|b` = first that exists), one image for every instance |
| `services.<svc>.browser` | fe: `{keys, keysIn, files: {local, remote}}`: env files plus (local) the compose environment plus `env`, written to an env file; `keys` are the URLs the edge fronts and CORS checks |
| `services.<svc>.syncDeps` | `[{lockfile, run, entrypoint, caches, env}]`: when the checkout's lockfile differs, `compose run` installs into the instance's volumes |
| `services.<svc>.air` | go: `{target, build, run}`: run air on the compose build's Dockerfile target, with these commands (`{{bin}}`) |
| `services.<svc>.preview`, `.share` | share preview build `{out, viteTemp, command, mkOut, needMiB, dropEnv, mode}`; `share.about` / `share.notice` text per backend kind |
| `services.<svc>.skipIfExists`, `.softFail`, `.restartDeadWorkersAfter` | init skipped on an existing instance when the file is in the instance dir; a non-zero init exit whose logs match is a warning; restart once if workers are dead after that init |
| `backends`, `profiles`, `stages`, `legacyProfiles`, `retiredServices`, `login`, `images`, `extras` | as before; an extra runs from its service definition (`env`, `dependsOn`) |
| `seed` | `{service, requires, counts: {service, command, stdin}}`: `cosmos seed` re-runs that init service and prints `key=count` lines |
| `share` | `reach` and `block` (`[{service, prefixes}]`) per backend kind |
| `hooks.beforeDown` | a shell command run before `down`/`rm` with `COSMOS_INSTANCE`, `COSMOS_INSTANCE_DIR`, `COSMOS_BACKEND`, `COSMOS_BACKEND_KIND`, `COSMOS_REMOVE` |
| `dashboard` | `backends`, `services`, `looks`, `steps`, `pins` for the web dashboard |

Offsets 40-49 (edge listeners) and 60 (share) are reserved by cosmos. Host port = 20000 + 100 * slot + offset.
An init service that exits non-zero fails the start (0.5 and later), unless its `softFail` matches.

### Migrating a 0.3 or 0.4 consumer

| 0.3 / 0.4 | 0.5 |
| --- | --- |
| `cosmos/package.json` + `bun.lock` pinning the package, `bunx cosmos` | `bun add -g @rajvarsani/cosmos` once per user, `cosmos`; `cosmos: ">=0.5.0"` in `cosmos.yaml` |
| `adapter:` and the adapter module | removed (cosmos refuses the key): move each hook to the keys above. `browserEnvs` to `browser` + `env`; `composeService` to `env`/`volumes`/`command` or the project's compose file; `composeExtra` to an extra's `env`; `buildPlan` to `image` or `air.target`; `airCommands` to `air`; `prepare` to `secrets`; `syncDeps` to `syncDeps`; `skipServices`, `waitInit`, `afterStage` to `skipIfExists`, `softFail`, `restartDeadWorkersAfter`; `seed` to `seed`; `envFilter` to `envSources.include`; `backendStatus`, `profileBlocker`, `doctor` to `requires`, `backendHost`, `vars`; `preview*` and `share*` to `preview`, `share`; `beforeDown` to `hooks.beforeDown`; `dashboard` to `dashboard` |
| cosmos-only Dockerfiles and sidecars | dev targets and services in the project's own Dockerfiles and compose; an app that needs a real change gets it in its own repo |
| `syncDeps: true` | a `syncDeps` list |

Volumes cosmos makes from anonymous compose (or `volumes:`) entries are named `cosmos-<instance>-<svc>-<target>-<image>`;
an instance made by an adapter that named its own volumes gets fresh ones (and a dependency install) on its next start.

## Commands

`cosmos --help` lists them. The dashboard serves its prebuilt build on `--port` / `COSMOS_DASHBOARD_PORT`
(default 20000) and refuses a busy port.

`cosmos top` is the same view in the terminal: one row per instance (name, slot, profile, backend, status,
memory, main URL), polled every 2s (memory every 5s) from the same state and docker reads the dashboard uses. It
does not need the dashboard running.

| Key | Does |
| --- | --- |
| `j` `k` `↑` `↓` | move |
| `enter` | details: services with status and memory, ports, URLs, share |
| `l` | logs of the main frontend; `tab` cycles services, `j`/`k` scroll, `G` follows |
| `o` | open the main URL in the browser |
| `s` | share on or off, as the dashboard's share button |
| `d` | take the instance down, after `y`/`n` |
| `/` | filter by name; `esc` clears |
| `g` | galaxy view |
| `?` | help |
| `q` `esc` | back out of logs, help or a prompt; `q` in the list or galaxy quits |
| `ctrl-c` | quit from anywhere |

## Development

```
bun install
bun run build:dashboard     # rebuilds src/dashboard/app/dist
bun test ./test
bash scripts/leak-check.sh  # COSMOS_DENYLIST points at the term list
```

## License

MIT. See [LICENSE](LICENSE).

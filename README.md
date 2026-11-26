# cosmos

Isolated instances of a project's docker compose stack on one machine: one slot of ports per instance, a git
worktree per source-mounted service, a Caddy edge for remote backends, zrok shares and a web dashboard.

## Install

Requires Bun 1.3 or newer and one supported container runtime: Docker Desktop, Colima or OrbStack (see
[Container runtimes](#container-runtimes)).

In the project you want to run, put `cosmos.yaml` at the repo root and the adapter where its `adapter:` key points
(see [Project contract](#project-contract)), then:

```
bun add -d @rajvarsani/cosmos
bunx cosmos doctor                                    # checks bun, the runtime, the project, git access, ports
bunx cosmos up --backend <backend> --profile <profile> --name "My Work"
bunx cosmos dashboard                                 # http://127.0.0.1:20000
```

`bunx cosmos` runs from the dir whose `package.json` has the dependency; cosmos then finds `cosmos.yaml` in that
dir or the nearest one above it (or `--project <dir>`). `up` runs `doctor` itself on the first run on a machine.
`bunx cosmos --help` lists every command.

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
`cosmos doctor` prints the pick and the runtime's own checks; adapters read it as `ctx.runtime`.

## Roots

| Root | Found by | Holds |
| --- | --- | --- |
| package | where it is installed | code, `docker/go-air.Dockerfile`, the prebuilt dashboard |
| project | `--project <dir>`, `COSMOS_PROJECT`, or the nearest dir upward with `cosmos.yaml` | `cosmos.yaml`, the adapter, the compose file |
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

`cosmos.yaml` may pin `cosmos: ">=0.2.0"`; a newer `schemaVersion` or an unmet range is refused with the upgrade
command. A 0.1 layout (`.state/state.json`, `instances/`, `envs/`, `vendor/`) is migrated on the first command in a
project: its instances and dirs move, old paths become symlinks, and `.state/state.json` is kept as
`state.json.migrated`. `cosmos doctor` reaps claims whose project dir is gone, or whose containers and record are gone.

## Project contract

| File | Role |
| --- | --- |
| `cosmos.yaml` | data: `schemaVersion: 1`, `projectId`, `compose`, `sourcesDir`, `adapter`, services (kind, offset, ports, health, mounts, workers), backends, profiles, stages, login, extras, envSources |
| adapter module | optional hooks typed by `import type { Adapter } from "@rajvarsani/cosmos/adapter"`; every runtime helper arrives on the context |

Offsets 40-49 (edge listeners) and 60 (share) are reserved by cosmos. Host port = 20000 + 100 * slot + offset.

## Commands

`cosmos --help` lists them. The dashboard serves its prebuilt build on `--port` / `COSMOS_DASHBOARD_PORT`
(default 20000) and refuses a busy port.

## Development

```
bun install
bun run build:dashboard     # rebuilds src/dashboard/app/dist
bun test ./test
bash scripts/leak-check.sh  # COSMOS_DENYLIST points at the term list
```

## License

MIT. See [LICENSE](LICENSE).

# cosmos

Isolated instances of a project's docker compose stack on one machine: one slot of ports per instance, a git
worktree per source-mounted service, a Caddy edge for remote backends, zrok shares and a web dashboard.

## Install

Requires Bun 1.3 or newer and Docker.

```
bun add -d @rajvarsani/cosmos      # or a tarball: bun add -d ./rajvarsani-cosmos-0.1.0.tgz
bunx cosmos --help
```

## Roots

| Root | Found by | Holds |
| --- | --- | --- |
| package | where it is installed | code, `docker/go-air.Dockerfile`, the prebuilt dashboard |
| project | `--project <dir>`, `COSMOS_PROJECT`, or the nearest dir upward with `cosmos.yaml` | `cosmos.yaml`, the adapter, the compose file |
| home | `COSMOS_HOME` (default `~/.cosmos`) | `.state/`, `instances/`, `envs/`, `vendor/<projectId>`, `cosmos.local.yaml` |

`vendor/<projectId>` is a detached worktree of the project at its HEAD; cosmos moves it when HEAD moves and no
instance is running.

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

# cosmos

Cosmos runs several copies of one Docker Compose app side by side on one machine. Each copy gets its own ports and
its own git worktree, so you can have one running copy per branch or per coding agent.

## Try it in 10 seconds

No Docker and no project needed. This opens the terminal dashboard with sample data:

```
bun add -g @rajvarsani/cosmos
cosmos top --demo
```

Press `g` for the galaxy view, `?` for help and `q` to quit.

Cosmos runs on [Bun](https://bun.sh) 1.3 or newer, so install it with bun. `npm i -g` and `npx` also install it,
but the `cosmos` command still needs `bun` on your PATH. `cosmos --version` prints the installed version.

## Quickstart with your own app

You need a running container runtime (Docker Desktop, Colima or OrbStack, see
[Container runtimes](#container-runtimes)) and a git repo with at least one commit. Cosmos reads the project from
its git HEAD, so commit `cosmos.yaml` and the compose file before `cosmos up`.

Put a `cosmos.yaml` next to your compose file. This one is complete and works as is.

`docker-compose.yml`:

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
```

`cosmos.yaml`:

```yaml
schemaVersion: 1        # required, always 1
projectId: hello        # required: lowercase letters, digits, dashes
compose: docker-compose.yml   # optional, this is the default

services:               # required: one entry per compose service cosmos runs
  web:
    kind: fe            # required: infra, init, app or fe
    estMiB: 20          # required: rough memory use in MiB
    offset: 1           # host port = 20000 + 100 * slot + offset
    containerPort: 80   # the port inside the container
    health: /           # HTTP path cosmos polls until the service answers

backends:               # required: at least one
  local:
    kind: local         # required: local or remote

profiles:               # required: at least one
  web:
    backend: local
    default: true
    services: [web]     # required: which services this profile starts

defaults:               # optional: what bare `cosmos up` runs
  backend: local
  profile: web
```

Then:

```
git add cosmos.yaml docker-compose.yml && git commit -m "add cosmos"
cosmos up                       # first copy, on http://localhost:20101
cosmos up --name "Second Copy"  # second copy, on http://localhost:20201
cosmos ls
cosmos rm --all                 # stop and remove both
```

Each `cosmos up` starts one copy, called an instance. An instance gets a slot number, and every port moves with the
slot, so copies never clash. A backend is what the frontends talk to: `local` runs the whole stack on your machine,
`remote` points frontends at an already deployed API. A profile is a named list of services to start.

`cosmos up` with no flags runs the project's `defaults`. `--backend`, `--profile` and `--name "My Work"` override
them. Cosmos finds `cosmos.yaml` in the working dir or the nearest one above it (or `--project <dir>`). `up` runs
`doctor` itself on the first run on a machine. `cosmos doctor` re-checks bun, the runtime, the project, git access
and ports. `cosmos dashboard` serves the web console on http://127.0.0.1:20000. `cosmos --help` lists every command.

A project needs only `cosmos.yaml` at its root (see [Project contract](#project-contract)): no cosmos dependency,
no adapter code, no cosmos-only Dockerfiles.

## The edge

For frontends that call a separate API, cosmos puts a small Caddy proxy (the edge) between an instance's frontends
and the backends they call: the deployed hosts on remote profiles, the instance's own services on local ones. It
answers CORS for the instance's origins and strips `Origin` upstream, so no backend needs a CORS change to run on
other ports.

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
| `schemaVersion`, `projectId` | required: `schemaVersion` is always `1`, `projectId` is lowercase letters, digits and dashes |
| `cosmos`, `compose`, `sourcesDir`, `network` | the minimum cosmos (semver range), the compose file (default `docker-compose.yml`), where source submodules live (default `services`), the compose network cosmos renames per instance |
| `defaults` | `{backend, profile, build}`: what bare `cosmos up` runs (that backend, and that profile when it runs there, else the profile marked `default` for the backend's kind) and what `cosmos build` builds |
| `prefetch` | services whose pinned source cosmos fetches for the catalog (sources that `vars` read) |
| `composeEnvFiles`, `envSources` | env bundles: `{from: [dirs], include: [globs]}` per bundle, copied into the home; `cosmos.local.yaml` overrides `from` |
| `vars` | per-backend values read from a service's source: `{service, file, match}` (first capture; `{{vars.x}}` in `match` is the backend's) |
| `requires` | `{local, remote}` lists of `{file, fix}`: a backend kind is available when they exist; drives the catalog and `doctor` |
| `backendHost` | `{file, key}`: the deployed host a remote backend's FE calls, for the catalog |
| `secrets` | `{service, file, keys, command, fix}`: keys an env file lacks, read from a command's JSON output and appended (local stacks) |
| `services.<svc>` | required: `kind` (`infra`, `init` one-shot job, `app`, `fe` frontend) and `estMiB` (rough memory). Port: `offset` + `containerPort` (set both or neither), `extraPorts` `[{key, offset, containerPort}]`, `hostPort` (the project's own host port, so `localhost:<hostPort>` in env values moves to the slot port). Readiness: `health` (HTTP path polled on start; unset or `null` uses docker's health status), `ready` (fe path polled on start, default `/`), `workers` `[{name, match}]` (processes that must be alive). Source: `srcMount` (where the worktree is mounted in the container), `repo` (source dir under `sourcesDir` when it differs), `uses` (run another service's image and source), `go` and `goMain` (a Go service run under air, and its main package dir). Other: `origin` (a browser origin backends allowlist), `remote` (fe may run against a deployed backend, default true), `url` (address shown for the port, `{port}` is replaced), `extra` (run from an `extras` entry, not from compose), `dependsOn` and `calledBy` (dependencies for services not in the compose file). Plus the keys below |
| `services.<svc>.env` | environment merged over the compose service's; a value is a template or `{value, if, else}` |
| `services.<svc>.volumes`, `.command` | compose short-syntax volumes added (anonymous ones become per-instance volumes keyed on the image), the command replaced |
| `services.<svc>.layouts` | `[{when: <file in the checkout>, vars}]`: the first match gives `{{layout.*}}` (a repo with two layouts) |
| `services.<svc>.image` | `{hashFiles, shared}`: tag keyed on file contents (`a\|b` = first that exists), one image for every instance |
| `services.<svc>.browser` | fe: `{keys, keysIn, files: {local, remote}}`: env files plus (local) the compose environment plus `env`, written to an env file; `keys` are the URLs the edge fronts (deployed hosts, or the instance's own service ports on local stacks) and the CORS check probes |
| `services.<svc>.syncDeps` | `[{lockfile, run, entrypoint, caches, env}]`: when the checkout's lockfile differs, `compose run` installs into the instance's volumes |
| `services.<svc>.air` | go: `{target, build, run}`: run air on the compose build's Dockerfile target, with these commands (`{{bin}}`) |
| `services.<svc>.preview`, `.share` | share preview build `{out, viteTemp, command, mkOut, needMiB, dropEnv, mode}`; `share.about` / `share.notice` text per backend kind |
| `services.<svc>.skipIfExists`, `.softFail`, `.restartDeadWorkersAfter` | init skipped on an existing instance when the file is in the instance dir; a non-zero init exit whose logs match is a warning; restart once if workers are dead after that init |
| `backends` | required, at least one: `<id>: {kind: local or remote, aliases, live, vars}`. `vars` feed `{{vars.<name>}}` |
| `profiles` | required: `<id>: {services, backend, default, title, about}`. `services` is required. `backend` is `local`, `remote` (the default) or a list of remote backend ids. A remote profile runs only frontends. One `default` per kind |
| `stages` | `[{id, services}]`: start order on local stacks, each stage waits until healthy. Services in no stage start last, together |
| `legacyProfiles`, `retiredServices` | `{old: new}` profile renames that still work with a note, and names of dropped services that older instance records may still list |
| `login` | `{email, password, firstName, lastName}`: the seeded user of local stacks, so `up` and `ls` show it only for local backends |
| `images` | `{name: image}`: when a compose service's `image:` is one of these names, the instance runs the mapped image |
| `extras` | `<id>: {url, sha, ref, dockerfile}`: a repo cosmos clones at that full commit sha and builds from its own Dockerfile. A service with `extra: <id>` runs it from its service definition (`env`, `dependsOn`) |
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

`cosmos top` is the same view in the terminal (`cosmos top --demo` shows it with sample data, no project or Docker needed): one row per instance (name, slot, profile, backend, status,
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

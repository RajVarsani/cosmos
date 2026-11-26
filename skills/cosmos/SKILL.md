---
name: cosmos
description: Spin up, use and tear down isolated instances of a project's stack (the full local compose stack, or frontends against a deployed backend) on this machine with the cosmos CLI. Use when you need a running app to test, QA, screenshot or develop against, or when asked to start, check, log or remove a cosmos instance. Not for the container runtime (Docker Desktop, Colima, OrbStack) or the cosmos dashboard process.
---

# cosmos

`cosmos` runs isolated instances of the project whose `cosmos.yaml` it finds (walking up from the cwd, or
`--project <dir>`). It is installed once per user (`bun add -g @rajvarsani/cosmos`); run `cosmos <cmd>` from
anywhere inside the project. The project's `cosmos.yaml` names the minimum cosmos it needs and an older install
refuses it with the upgrade command. Every command takes `--json`; always pass it
and parse the output. `cosmos --help` is the reference for commands and flags. This skill says when and how to
use them safely. The project's own docs (its README, beside `cosmos.yaml`) add its rules: which backends are live, which profile
to pick, where the seeded login is. Read them before the first `up`.

`cosmos doctor --json` checks the machine and shows which container runtime is active.

`cosmos top` is a full-screen terminal dashboard for people (keys: `j`/`k` move, `enter` details, `l` logs, `o`
open, `s` share, `d` down, `/` filter, `g` galaxy, `?` help, `q`/`esc` back, `q` in the list quits, `ctrl-c` quits). It needs an interactive terminal; agents
use `ls`, `status` and `logs` with `--json` instead.

## When to use

You need a running app: browser QA, a screenshot, an API to call, a change to try against a real stack. If a
suitable instance of yours already exists, reuse it.

## Hard rules

1. Only touch instances you created. Read `owner` in `cosmos ls --json` (`cwd`, `sessionId`, `via`). Yours
   means the owner matches your cwd and session. Anything else, or `via: "dashboard"`, belongs to someone
   else: never stop, start, down, rm, seed or reconfigure it. Reading `status`, `ports` and `logs` is fine.
2. Never change the container runtime's settings, start or stop it, or run `docker context use`. Never touch the
   dashboard process (`cosmos dashboard`). Do not run `docker` commands against cosmos containers; use
   `cosmos logs`.
3. Never use `--all` on `down` or `rm`. Name your instances.
4. Backends with `live: true` in `cosmos catalog --json` hold live customer data: read-only browsing at most,
   no form submits, no mutations, and prefer not to use them at all. Do not write to any deployed backend
   unless the project's docs say you may.
5. Local profiles are heavy. Check memory before `up` (below).

## Pick the lightest profile

1. `cosmos profiles --json`: each profile has `estMiB`, `services`, `backends`, `canRun` and a `reason` when it
   cannot run now.
2. `cosmos catalog --json`: every backend x profile, plus `vm.availableMiB` (free VM memory) and `vm.floorMiB`
   (what must stay free).

Prefer a remote profile for UI work. Go local only when the task writes data or needs backend code running.
Local needs `canRun: true` and `vm.availableMiB` well above the profile's `estMiB` plus `floorMiB`. If it is
short, pick a lighter profile or report it; do not stop other people's instances to make room.

## Up

Name the instance after what you are working on, free text is fine:

```
cosmos up --backend <backend> --profile <profile> --name "Letter Platform" --json
```

- The id is the slug (`letter-platform`). Use that id in every later command.
- Reruns reuse by name: `up` with the same `--name` brings up the existing instance. Backend or profile must
  match, else it errors and asks for `rm` first. Use one stable name per piece of work.
- `up` blocks until ready and prints JSON with `name`, `url`, `urls` (per service), `ports`, `cors`,
  `warnings`, `memory`. Open `url` for the app, `urls.<svc>` for others.
- Local profiles default to `--backend local`. Cold local starts take minutes; use `--timeout S` for a ceiling.
- Each source-mounted service runs from the instance's own git worktree,
  `COSMOS_HOME/projects/<projectId>/instances/<id>/src/<svc>`, at the project's pinned commit. Edit and commit
  there. `cosmos src <id>` shows what each runs;
  `cosmos src <id> <svc>` lists branches; `cosmos src <id> <svc> <branch|tag|sha> --json` switches one and
  recreates only its containers; `--pinned` goes back to the project's commit.
- Branch sets at create: `cosmos up ... --branch <svc>=feat/a --json` (one per service, new instances only).
- Live mounts: a branch checked out in a linked worktree outside cosmos (your own `git worktree add` of the
  project's submodule) is mounted from that directory, so edits there hot-reload. A branch checked out in the
  project clone itself runs as a copy unless `--live` mounts the clone. Cosmos never switches, resets or
  removes a live checkout; `rm` only unmounts it. Containers may still write build output into a mounted dir.
- A switch refuses to orphan commits on no branch or overwrite ignored files like `.env.local`; save them
  (`git branch <name>` in the worktree) rather than reaching for `--force`. `rm` refuses while a worktree holds
  unsaved work, and never removes a locked worktree.

Check any `warnings` and `cors` entries with `allowed: false` before trusting the app.

## Confirm ready

```
cosmos status letter-platform --json
```

Each service has `running`, `health` and, for HTTP services, `http.ok`. Ready means every long-running service
is `running` and healthy. One-shot init jobs show `exited`; that is normal. `workers` and `cors` are in the same
output. If something is not ready, wait and poll again; do not rerun `up` on a half-started instance unless
status says a service failed.

## Login

When the project seeds a test user, its `cosmos.yaml` has a `login:` block, and `cosmos ls --json` returns
`login` (the email). Read the password from the file when you need it; do not paste it into PRs, commits or chat.

## Logs and debugging

```
cosmos logs letter-platform <svc> --tail 200 --json
```

The service defaults to the instance's main frontend. Skip `-f` (it never returns). `cosmos seed <name>`
re-runs the project's seed on your running local instance, when the project defines one.

## Share

Sharing is opt-in. `cosmos share <name> --json` (or `cosmos up ... --share`) gives a public link for someone off
this machine: `url` (stable, `<instance>-<user>.shares.zrok.io`), `public`, `user` and `password` (null when
public), `state` (starting, live, restarting, unavailable with `reason`, stopped), `preview` (the build viewers
see) and `remote` (what the viewer gets). Only share your own instances, never one on a live backend, and say who
gets the link. `--password` puts the share behind a generated password (pass it separately from the link);
`--public` takes it off again. Pass on any `notice` in the output. `--expose-admin` opens paths the project
blocks on shares; do not use it unless asked. `cosmos unshare <name> --json` when done. Never run `zrok`
commands yourself and never stop a zrok process or delete a zrok name cosmos did not create.

## Done

When the work is finished, remove what you created:

```
cosmos rm letter-platform --json
```

`rm` drops volumes and frees the slot. `down` only stops it (keeps the slot and data). Leave nothing running
that you started. Never rm an instance you did not create.

## Report

Say the instance id, `url`, profile, backend and whether it is still running, so the next agent or person can
find it.

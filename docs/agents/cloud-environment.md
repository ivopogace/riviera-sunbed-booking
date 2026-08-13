# The cloud environment (Claude Code on the web)

How a Claude Code cloud session for this repo gets provisioned, and which half lives where.
Written at #659, which found a repo script (`scripts/web-setup.sh`) that claimed to be the
environment's setup script and was wired to nothing.

## Two phases, and the split is not ours to choose

Anthropic's cloud-environment documentation defines the division of labour: the **setup
script provisions the VM itself** (toolchains), and a **`SessionStart` hook does project
setup** (`npm ci` and friends). This repo already matches that shape.

| Phase | Lives in | Runs | Job |
|---|---|---|---|
| **Setup script** | the environment's *Setup script* field on claude.ai — **outside version control** | once when the VM image is built, **before the repo is checked out** | select and pin the Node toolchain, and shadow the image's baked-in node so everything after it resolves the pinned one |
| **SessionStart hook** | [`scripts/cloud-session-setup.sh`](../../scripts/cloud-session-setup.sh), wired in [`.claude/settings.json`](../../.claude/settings.json) under `hooks.SessionStart` | at every session start, **after checkout**, with `$CLAUDE_PROJECT_DIR` available | everything repo-dependent: frontend `npm ci`, JDK 25, the proxy CA, dockerd, plugin payloads, `gh` |

The boundary is checkout. The setup script cannot read `.nvmrc`, `package-lock.json`, or any
other file in this repository, because none of them exist yet when it runs.

## The setup script, verbatim

This is the exact content of the environment's *Setup script* field. It is reproduced here
because the field itself cannot be reviewed, diffed, or tested — a copy under review is the
best available substitute.

<!-- cloud-setup-script:start -->

```bash
#!/bin/bash
export NVM_DIR=/opt/nvm
. "$NVM_DIR/nvm.sh"
nvm install 26.0.0
nvm alias default 26.0.0
NODE_BIN="$NVM_DIR/versions/node/v26.0.0/bin"
mkdir -p "$HOME/.local/bin"
ln -sfn "$NODE_BIN/node" "$HOME/.local/bin/node"
ln -sfn "$NODE_BIN/npm"  "$HOME/.local/bin/npm"
ln -sfn "$NODE_BIN/npx"  "$HOME/.local/bin/npx"
"$HOME/.local/bin/node" --version
```

<!-- cloud-setup-script:end -->

Why it shadows node at all: the image ships a baked-in Node that is first on `PATH`, and the
frontend's engine range rejects it (`EBADENGINE`). More importantly, the harness spawns the
MCP servers under whatever node `PATH` resolves at session start, and a failed MCP spawn is
**not** retried mid-session. `$HOME/.local/bin` is first on `PATH` on these images — ahead of
the image's node directory, which itself precedes `/usr/local/bin`, so `/usr/local/bin` is
not a safe target.

## Bumping the Node version

The pin exists in **three** places, and only two of them are in this repository:

1. [`.nvmrc`](../../.nvmrc) — read by CI (`actions/setup-node`), the Dockerfile, and
   contributor toolchains. The source of truth.
2. The code block above — a mirror.
3. The *Setup script* field on claude.ai — the copy that actually runs in cloud.

So a bump is three edits, in that order, in one sitting. `scripts/check-cloud-node-pin.mjs`
(a CI hygiene guard) proves 1 and 2 agree; **nothing can prove 3**, because it is not
reachable from a diff. If a cloud session ever reports a Node version that disagrees with
`.nvmrc`, step 3 was the one that got skipped.

## Why the setup script is not a repo script (#659)

`scripts/web-setup.sh` used to sit in the tree offering itself as the field's target. Two
reasons it was deleted rather than wired up:

- **It did both jobs.** It pinned Node *and* ran `npm ci` in `frontend/`, which is the hook's
  half of the split above.
- **Pointing the field at it would risk sessions failing to start.** It was `set -euo
  pipefail` and read `$REPO_ROOT/.nvmrc` — a file that does not exist at setup-script time.

## Consequences worth knowing

- **The `angular-cli` MCP launcher takes its npx fallback in every cloud session.** No
  `npm ci` runs before Claude Code launches, so `frontend/node_modules` is absent when
  [`scripts/angular-cli-mcp.mjs`](../../scripts/angular-cli-mcp.mjs) spawns and its
  repo-local fast path is unreachable. That is expected, not a defect: the fallback exists
  for exactly this case and `MCP_TIMEOUT` in `.claude/settings.json` covers the slower spawn
  (#656). Do not "fix" it by moving `npm ci` into the setup script.
- **The network allowlist is enforced outside both scripts**, in the environment's
  network-policy config. `registry.npmjs.org` is required for the hook's `npm ci`, for the
  `playwright` MCP server's `npx` spawn, and for the `angular-cli` launcher's npx fallback;
  only that launcher's local-binary fast path is network-free. `angular.dev` is needed at
  tool-call time by the MCP doc-search tool.

## Related

- [`docs/agents/gradle-proxy-trust.md`](gradle-proxy-trust.md) — the proxy CA and wrapper-403
  details behind the hook's JDK steps.
- [`docs/agents/docker-testcontainers.md`](docker-testcontainers.md) — how the session's
  dockerd is provided, and how to stop it safely.
- `riviera-local-debug` — the build/test recipes that assume this provisioning.

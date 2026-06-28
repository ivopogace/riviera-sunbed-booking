# Docker for backend Testcontainers ITs (web sessions)

The backend integration tests use **Testcontainers** (Postgres 17) and are gated by
`@EnabledIfDockerAvailable` (`platform/src/test/java/ai/riviera/platform/`). When no
Docker daemon is reachable they **skip cleanly** — which is the default in Claude Code
on the web. This note explains how a daemon is provided so `./gradlew test` runs the
full backend suite, and how to start it by hand if needed.

> The `@EnabledIfDockerAvailable` annotation and its `DockerAvailableCondition` are the
> **correct design** — they keep the ITs graceful (skipped, not failed) on any machine
> without Docker. **Do not remove them.** The fix for "ITs skip locally" is to provide a
> daemon (this note), never to drop the guard.

## How Docker is provided

In **cloud sessions** (Claude Code on the web), the SessionStart hook
`scripts/cloud-session-setup.sh` calls `scripts/start-dockerd.sh` as its third step,
after the frontend deps and the JDK 25 toolchain. So a daemon is up automatically by
the time you run tests — no manual step. Local (non-cloud) sessions are skipped
(`CLAUDE_CODE_REMOTE != true`); developers manage their own Docker.

## Manual fallback (one-liner)

If the daemon isn't running (e.g. it didn't survive, or you're debugging), start it
with the same idempotent script the hook uses:

```bash
bash scripts/start-dockerd.sh
```

It exits 0 immediately if a daemon is already reachable, so it's safe to re-run. Then:

```bash
docker info                                                   # should exit 0
cd platform && ./gradlew cleanTest test --tests "ai.riviera.platform.venue.*"
# → 6 ITs run, 0 skipped, green (VenueReadControllerIT 4, VenueSeedMigrationIT 2)
```

## Why it's set up this way (gotchas)

- **Storage driver `vfs`.** The sandbox can't use `overlay2` (no overlay/privileged
  mounts), so the daemon launches with `--storage-driver=vfs`. Slower but works
  without privileges.
- **Registry pulls go through the agent proxy.** `dockerd` reads `HTTP(S)_PROXY` /
  `NO_PROXY` from **its own** environment for image pulls; the script injects them from
  `$HTTPS_PROXY`. It also trusts the proxy CA so registry TLS verifies — otherwise
  `docker pull postgres:17` fails with an `x509`/certificate error:

  ```bash
  cp /root/.ccr/ca-bundle.crt /usr/local/share/ca-certificates/ccr-proxy.crt
  update-ca-certificates
  ```

  (The container registry / Docker Hub must also be allowed by the environment's
  network-egress policy — already configured by the maintainer.)
- **Detached lifecycle.** A daemon backgrounded inside a single tool call doesn't
  reliably survive across calls, so the script launches it with `setsid` + redirected
  stdio so it reparents to init and stays up for the whole session.

## Lifecycle — stopping the daemon

**Never `pkill -f dockerd`.** That pattern matches the launching shell's *own* command
line, so `pkill -9 -f dockerd` kills the session itself. Stop the daemon by its pidfile:

```bash
kill "$(cat /var/run/docker.pid)"
```

Logs are at `/var/log/dockerd.log` if you need to diagnose a daemon that won't start.

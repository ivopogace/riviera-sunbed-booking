# Prompt: fix (or definitively rule out) local backend builds in Claude Code on the web

> Paste everything below into a fresh Claude Code session on the `riviera-sunbed-booking`
> repo. It is self-contained — it assumes no memory of the diagnosis that produced it.

---

## Your task

In this **Claude Code on the web** (cloud/sandbox) session, the backend build **cannot run
locally**: `cd platform && ./gradlew test` fails because the Gradle 9.6.1 distribution and a
JDK 25 toolchain can't be downloaded. I want you to **either** make a local `./gradlew test`
work in this environment, **or** confirm with evidence that it's impossible from inside the
session and produce the exact, minimal change (and where it must be applied) that would fix it.

Do **not** disable TLS verification, unset `HTTPS_PROXY`, or route around the egress policy.
Do **not** downgrade the project's pinned Gradle or the Java 25 toolchain to work around it.

## What the repo needs to build

- Gradle **9.6.1** (pinned in `platform/gradle/wrapper/gradle-wrapper.properties`).
- A **JDK 25** toolchain (`platform/build.gradle`: `languageVersion = JavaLanguageVersion.of(25)`).
- Backend deps (Spring Boot 4.1.0, Spring Modulith 2.1) from Maven Central + the Gradle plugin portal.
- Docker (Testcontainers Postgres 17) for the integration tests — the pure ArchUnit/Modulith
  tests (`*ArchitectureTests`, `ModularityTests`) don't need it.

## The environment (as diagnosed previously)

- The image ships **JDK 21 only** (`/usr/lib/jvm/java-21-openjdk-amd64`); **no JDK 25**.
- System Gradle is **8.14.3** (`/opt/gradle`), too old for Spring Boot 4.1.0 + Java 25.
- Outbound HTTPS goes through an **agent policy proxy**. Network access level appears to be
  **Trusted** (the documented default).
- **GitHub access for this session is repo-scoped to only `ivopogace/riviera-sunbed-booking`.**
  This is the crux — see below.

## Reachability, already measured (re-verify if you like)

| Host | Result | Meaning |
|---|---|---|
| `repo.maven.apache.org`, `repo1.maven.org`, `plugins.gradle.org` | **200** | deps resolve fine |
| `download.oracle.com/java/25/latest/jdk-25_linux-x64_bin.tar.gz` | **200** | **Oracle JDK 25 is downloadable** |
| `registry-1.docker.io` / `auth.docker.io`; local `docker info` | 401 / 200; **daemon UP** | Docker works |
| `services.gradle.org/distributions/gradle-9.6.1-bin.zip` | **403** | redirects to GitHub, then blocked |
| `api.github.com/repos/adoptium/temurin25-binaries/releases/latest` | **403** | repo-scope block |
| `github.com/gradle/gradle-distributions/releases/...` | **403** | repo-scope block |
| `cdn.azul.com`, `download.java.net`, `api.foojay.io` | **000** | other JDK sources blocked |

The 403 body on the GitHub ones is:
`{"message":"GitHub access to this repository is not enabled for this session. Use add_repo to request access."}`

## Root cause

Two **independent** blockers:

1. **Gradle 9.6.1** — the wrapper hits `services.gradle.org` (allowlisted) which **307-redirects
   to `github.com/gradle/gradle-distributions/releases/download/...`**. That GitHub URL is gated
   by the **GitHub proxy**, which is scoped to only this repo → **403**. Per the Claude-Code-on-web
   docs the GitHub proxy is *independent of the Network-access level*, and `github.com`/`api.github.com`
   are **already** in the default Trusted allowlist — so **adding a domain or switching to Full will
   NOT fix this**. Gradle has **no non-GitHub distribution source**.
2. **JDK 25** — the setup hook fetches **Temurin via `api.github.com` + GitHub release assets**,
   which hit the same repo-scope 403. `api.foojay.io`/Azul/OpenJDK are also blocked. **But
   `download.oracle.com` (Oracle JDK 25) is allowlisted and reachable** — the hook just doesn't use it.

## Existing provisioning to build on (already in the repo)

- `scripts/cloud-session-setup.sh` — the **SessionStart hook** (registered in `.claude/settings.json`).
  Cloud-only. Installs JDK 25 (Temurin-from-GitHub → currently **fails** the repo-scope gate),
  trusts the proxy CA for the JDK, starts Docker. `/opt/jdk-25` is **absent** this session because
  its GitHub-based JDK step 403s.
- `scripts/trust-proxy-ca-java.sh` + `docs/agents/gradle-proxy-trust.md` — JDK↔proxy CA trust (PKIX).
- `scripts/start-dockerd.sh` + `docs/agents/docker-testcontainers.md` — Docker daemon (working).
- Prior context: every ADR-0007 restructure slice (#76–#81) hit this and treated **CI as the
  authoritative build** (see the "Safety net" note in `docs/plans/issue-81-*.md`).

## What I want you to do

1. **JDK 25 — fix it now, no config change needed.** Patch `scripts/cloud-session-setup.sh` step 2
   to install **Oracle JDK 25 from `download.oracle.com`** (allowlisted, reachable) as the primary
   source, keeping the Temurin/GitHub path only as a fallback. Install it into `/opt/jdk-25`, set
   `JAVA_HOME`/`PATH` via `$CLAUDE_ENV_FILE`, then run `scripts/trust-proxy-ca-java.sh`. Make it
   idempotent. Verify `/opt/jdk-25/bin/java -version` reports 25. Update `docs/agents/gradle-proxy-trust.md`
   to note the Oracle primary source.

2. **Gradle 9.6.1 — determine the one viable path and state it precisely.** It has no non-GitHub
   source, so it needs **one** of:
   - the session's **GitHub repo scope broadened** so the GitHub proxy allows reads of the *public*
     `gradle/gradle-distributions` repo (per docs, a normally-connected session can read "any
     repository the connecting GitHub account can see" — public repos included; this session is
     pinned tighter, which is why it 403s). This is a **change the human makes** to how the session
     is launched/connected — you cannot do it from inside the sandbox. Spell out exactly what they
     do (fresh non-repo-locked web session, or the `add_repo` affordance the 403 references), OR
   - **image/setup-side provisioning of Gradle 9.6.1** from an allowlisted source. Investigate
     whether one exists (it likely does **not** — confirm). If not, say so plainly.

   Do not pretend a domain-allowlist edit fixes Gradle. If the only real fix is human-side, say that
   clearly and stop — don't burn cycles.

3. **If (and only if) both toolchains become available**, run `cd platform && ./gradlew test`
   (or at minimum `--tests "*ArchitectureTests" "*ModularityTests"`) and report the result.

4. **Deliverable:** the hook patch (item 1) + a short written verdict on Gradle (item 2) — is a
   fully-local build achievable in this session, yes/no, and the exact minimal action (and who must
   take it) to get there. Keep it evidence-based; re-measure any reachability you rely on.

## Guardrails

- Never disable TLS / unset the proxy / add `-k`. Report blocked hosts; don't tunnel around them.
- Don't change the pinned Gradle version or the Java 25 toolchain.
- Oracle JDK 25 is licensed under the Oracle NFTC (free for development/testing) — fine for a dev
  toolchain; note it in the hook comment.
- CI already builds this repo correctly (Gradle 9.6.1 + JDK 25 present there); local builds are a
  developer-velocity nicety, not a correctness gate. Don't over-invest if item 2 turns out human-only.

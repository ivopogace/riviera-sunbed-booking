# Supply-chain security notes

Lessons distilled from the "Shai-Hulud npm worm" write-up (JAVAPRO 01/2026) and applied to
*this* repo. The worm spread through npm in <24h via phishing → a malicious `postinstall`
script → local secret-scanning → automated re-publish. The takeaway isn't "npm is bad" — it's
that **the build/install step (CI, deploy, dev/agent sessions) is an attack surface**, and our
dependency + vendoring habits need to assume a popular package can turn hostile.

This is guidance, not a forced policy change — items under **Decisions for a human** change
behavior and should be chosen deliberately.

## Where we stand today (accurate as of this note)

- **Dependabot** is configured (`.github/dependabot.yml`) for Gradle (`/platform`), npm
  (`/frontend`), and github-actions, weekly. **There is no auto-merge workflow** — dep bumps
  go through CI + the SDD review gate like any PR. Good: that is the recommended posture; do
  **not** add blind auto-merge for dependency PRs.
- **`npm ci` runs with install scripts enabled** in `ci.yml`, `deploy.yml`,
  `scripts/web-setup.sh`, and `scripts/cloud-session-setup.sh`. A compromised frontend dep's
  `postinstall` would therefore execute in CI, in the deploy job, and in agent sessions — the
  exact Shai-Hulud vector.
- **Third-party skills are vendored after a manual safety review** (e.g. the Supabase Postgres
  skill: checked for scripts/network/injection before adapting; the VoltAgent list: inspected,
  not blindly imported). Keep doing this — it is the skill-equivalent of dependency vetting.
- **Scanning:** CodeQL runs in CI, and SonarCloud runs and reports its quality gate on
  every PR (the `SONAR_TOKEN` secret is configured). GitHub secret scanning / push
  protection status is a repo setting (see below).

## Standing practices (keep doing)

- Commit lockfiles (`package-lock.json`, the Gradle wrapper + `gradle-wrapper.properties` with
  `validateDistributionUrl=true`) so installs are deterministic.
- Every dependency PR clears **CI + the review gate** before merge — never auto-merged.
- Vet any vendored third-party content (skills, snippets) for scripts / network calls /
  injection **before** adding it, and record provenance + license (as the `postgres` skill's
  `LICENSE` and metadata do).
- No secrets in the repo or in build artifacts; secrets come from env / the platform secret
  store (invariant #8). Bytecode/config is readable (see `gradle-proxy-trust.md` neighbours and
  the AI-reverse-engineering reality) — a committed secret is a leaked secret.

## Decisions for a human (behavior changes — choose deliberately)

- **`npm ci --ignore-scripts` in CI/deploy.** Strongly reduces the postinstall blast radius,
  but can break legitimate postinstalls (Playwright browser wiring, some Angular tooling). If
  adopted, test the FE build/test first and add an explicit allowlisted step for any script
  that is genuinely required. Candidate change in `ci.yml`, `deploy.yml`, and the two session
  scripts.
- **Branch protection on `main`:** the CI, CodeQL, and SonarCloud checks already run and
  pass on PRs; making them *required* status checks (plus a required review) before merge —
  so a poisoned PR can't land green-but-unreviewed — is still a repo setting to turn on.
  (Org/repo setting — not in the repo tree.)
- **Account hardening for anything that can publish or merge:** hardware (FIDO2) MFA on GitHub;
  least-privilege, time-limited tokens; enable **secret scanning + push protection**. TOTP is
  phishable (the worm captured TOTP in real time); hardware keys are the real defense.
- **Dependency vetting depth:** consider OpenSSF Scorecard / `npm audit` signal on new or
  bumped deps, and prefer well-maintained packages over popular-but-thin ones.

## Related

- `riviera-review-overlay` → `RV-BE-13` (no injection: SQL / log / deserialization) covers the
  *code* side; this note covers the *dependency/build* side.
- `docs/agents/gradle-proxy-trust.md`, `docs/agents/docker-testcontainers.md` — other
  build-environment notes.

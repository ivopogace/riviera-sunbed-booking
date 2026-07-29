# Runbook — Mailer-profile activation + smoke send

End-to-end manual check of the **real** SMTP mail path (#368, ADR-0011), which CI only exercises
against an in-JVM GreenMail sink (`SmtpMailerIT`). Activates the `mailer` profile against a real
relay — **Scaleway TEM** in deployment, any RFC-compliant 587/STARTTLS relay by config — and proves
a verification / reset email actually arrives with a working link. Mirrors
`stripe-profile-smoke-test.md` (the same env-secret posture, invariant: no secret in repo/image/logs).

> The default (no-profile) run uses the recording `MockMailer` and needs none of this. `prod` alone
> still aborts at boot (`MockMailerProdGuard`); production activation is `prod,mailer`.

## Prerequisites (the #370 human setup — one-time)

- **Platform sending domain** exists (a launch decision shared with #291 — `*.onrender.com`
  cannot be a sender domain).
- **Scaleway account** created, **TEM enabled**, **DPA/AVV signed**; Scaleway added to the
  processor list in the privacy-policy work (#101).
- Domain **verified in TEM**; **SPF / DKIM (2048) / DMARC** records published and green in the
  TEM console. Open/click tracking stays **off** (ADR-0011 — no pixels, no rewritten links).
- **SMTP credentials** generated in TEM. They are deploy-environment secrets — never committed,
  never logged, rolled after any exposure.
- **Docker** running locally (the backend auto-starts Postgres from `platform/compose.yaml`).

## 1. Run the backend under the `mailer` profile

```bash
cd platform
RIVIERA_SMTP_HOST=smtp.tem.scw.cloud \
RIVIERA_SMTP_USERNAME=<tem-smtp-username> \
RIVIERA_SMTP_PASSWORD=<tem-smtp-password> \
RIVIERA_MAIL_FROM=noreply@<platform-domain> \
RIVIERA_RECOVERY_LINK_BASE_URL=http://localhost:8080 \
SPRING_PROFILES_ACTIVE=mailer \
./gradlew bootRun
# Port defaults to 587 (RIVIERA_SMTP_PORT to override). STARTTLS is required, timeouts finite.
```

**Negative check first (fail-at-boot, AC):** run once with the env vars **unset** — boot must
abort on an unresolved `RIVIERA_SMTP_*`/`RIVIERA_MAIL_FROM` placeholder, not start and fail on
first send.

> `RIVIERA_RECOVERY_LINK_BASE_URL` points the emailed links at the origin serving the SPA —
> same-origin `:8080` when running the bundled build; `http://localhost:4200` (the default) when
> the dev SPA server is up. Deployed: the backend's own origin (`docs/deploy/cd-pipeline.md`).

## 2. Smoke send via the sign-in page

Use a real inbox you control, and drive the flows through the SPA — the register and
forgot-password endpoints are CSRF-protected (`X-XSRF-TOKEN`, `SecurityConfig`), and the SPA's
interceptor handles the cookie-to-header dance that a bare `curl` would have to hand-roll:

1. Open `<origin>/account/sign-in` → **Register** with `<your-inbox>` → the **verification
   email** is sent (soft/non-blocking — the UI signs you in regardless).
2. Sign out → **Forgot password?** → submit `<your-inbox>` → the **reset email** is sent (the
   response is deliberately uniform whether or not the email is registered, D-8 — the inbox is
   the observable).

## 3. Verify

- Both emails arrive (check spam too — first sends from a fresh domain may land there until
  reputation builds); `From:` is the configured address.
- **Plain text**, no pixels/rewritten links; the link points at
  `RIVIERA_RECOVERY_LINK_BASE_URL` + `/account/verify?token=…` / `/account/reset?token=…`.
- Opening the reset link renders the SPA page and the reset completes (the GET never consumes
  the single-use token — the SPA issues the POST).
- The backend log contains **no token or link** (invariant #7) — a failed send logs only the
  exception class name.
- In the TEM console: two accepted messages; SPF/DKIM/DMARC all pass on the received headers
  (Gmail: *Show original*).

## Local variant (no Scaleway, no credentials)

**One-flag path — the `smtp4dev` profile** (#368): a dedicated local-dev profile whose defaults
target a local [smtp4dev](https://github.com/rnwood/smtp4dev) sink, so no env vars are needed at
all. Start the sink (`platform/tools/smtp4dev/start smtp4dev.bat` — SMTP on `:2525`, inbox UI on
<http://localhost:3000>), then:

```bash
SPRING_PROFILES_ACTIVE=smtp4dev ./gradlew bootRun    # (in platform/)
```

Real sends land in the smtp4dev inbox UI. `prod,smtp4dev` still aborts at boot (the mock-mailer
guard fires on `prod & !mailer`) — this profile is local-only by construction; pinned by
`MailerProfileWiringTest.smtp4devProfileBootsTheRealMailerOnLocalDefaultsWithoutEnv`.

**Env-driven path — any sink under the `mailer` profile** (proves the deployment posture's
wiring, e.g. with GreenMail):

```bash
docker run --rm -p 3025:3025 greenmail/standalone:2.1.3   # SMTP on 3025, all creds accepted
RIVIERA_SMTP_HOST=localhost RIVIERA_SMTP_PORT=3025 \
RIVIERA_SMTP_USERNAME=x RIVIERA_SMTP_PASSWORD=x \
RIVIERA_MAIL_FROM=noreply@local.test \
SPRING_PROFILES_ACTIVE=mailer ./gradlew bootRun
```

> Local sinks (GreenMail standalone, smtp4dev, Mailpit) often speak plain SMTP without STARTTLS;
> if the handshake is refused, add `RIVIERA_SMTP_STARTTLS_REQUIRED=false` to the env above —
> STARTTLS upgrade stays opportunistic, only the hard requirement is relaxed. **Never set this
> deployed** (the default `true` is the posture that keeps credentials off plaintext hops). CI's
> `SmtpMailerIT` covers this path automatically; the variant is only for hand-driving the full flow.

## Production activation (when #370 closes)

1. Set `RIVIERA_SMTP_*`, `RIVIERA_MAIL_FROM`, `RIVIERA_RECOVERY_LINK_BASE_URL`, and
   `RIVIERA_SUPPRESSION_PEPPER` (#388 — the `prod` profile aborts at boot without a real pepper)
   on the Render service (env section: `docs/deploy/cd-pipeline.md`).
2. Change `SPRING_PROFILES_ACTIVE` to `prod,mailer`.
3. Redeploy; confirm boot (a missing var aborts, by design), then run step 2's smoke send
   against the deployed origin.
4. Roll the TEM SMTP password afterward if it was ever pasted anywhere but the env config.

## Known interim limits (this slice)

- ~~Sends are **synchronous on the request thread** until #369~~ — **resolved by #369**: recovery
  sends now dispatch off the request thread through a dedicated bounded in-memory executor, so the
  timing account-enumeration oracle is closed and this is no longer a bar to activation. Activation
  remains gated on **#370** alone (sending domain + DPA). Two consequences worth knowing before you
  activate: a send is **best-effort** (a crash or redeploy past the drain window loses it — the user
  re-requests; since #410 that window is derived from the relay socket budget,
  `riviera.notification.mail.socket-timeout-ms`, rather than being a flat 5s that expired while a send
  was still legitimately running), and a failed send is logged at WARN by `AsyncMailDispatcher` /
  `CustomerRecovery` naming only the exception class, never the address or link — so "did it send?"
  is answered from the provider console, not from our logs.
- Only verification + reset emails exist; the booking-confirmation email is #371.
- No bounce/complaint suppression yet (later slice) — watch the TEM console during early use.

# ADR-0016: Abuse protection on public writes is self-hosted ALTCHA proof of work, verified at the edge against a Postgres single-use registry

- **Status:** Accepted
- **Date:** 2026-09-03
- **Relates to:** the abuse-hardening epic #903,
  `docs/architecture/auth-signin-register.md` § D-8 (the rate-limit layer this sits on top of),
  ADR-0004 (hosting; the instance-count caveat this deliberately avoids), ADR-0011 (the DSGVO
  posture: no third-country processor where an EU-only or self-hosted option exists), invariant
  #12 (the registry table is a Flyway migration), RV-BE-11 (login and abuse machinery live at the
  platform edge, never in a module). Evidence:
  `docs/research/2026-09-03-altcha-proof-of-work-and-replay-registry.md`.

## Context

Four unauthenticated `POST`s cost the platform money or inventory when a script hits them:
customer register and operator register create rows and send mail, forgot-password sends mail,
and guest booking create holds a sunbed set until the abandoned-booking sweep releases it. The
D-8 rate limiter is the first line, but it keys on client IP and submitted identity, and both
weaken exactly where tourists are: behind venue WiFi and mobile CGNAT, one address is hundreds
of people. What was missing is a **per-request cost** that a browser pays without noticing and a
bot farm pays at scale.

The obvious tools fail the project's DSGVO constraint. reCAPTCHA sends every visitor's IP,
cookies and behavioural signals to Google in the US and German and Austrian supervisory
authorities have treated its use without consent as unlawful; Cloudflare Turnstile and hCaptcha
are lighter but are still a third-party processor with a transfer question, a DPA to sign and a
consent-banner debate. The prod target is an EU host chosen for exactly this posture (ADR-0004,
ADR-0011), so adding a US processor to the sign-up path would undo that choice.

ALTCHA is an MIT-licensed proof-of-work scheme: the server issues an HMAC-signed challenge, the
browser brute-forces a key-derivation in Web Workers, the server verifies the result. Nothing is
sent anywhere but our own origin, no cookie is set, nothing fingerprints the visitor. The widget
is bundled from npm into the SPA, the challenge endpoint is ours, and the only outbound reference
is a plain hyperlink in the widget footer. The ALTCHA project also sells hosted verification and
spam-filter APIs; those are third parties again and are **not** used.

The remaining design question was replay protection. ALTCHA's own guidance makes the server
responsible for accepting each solved challenge once, and none of the official libraries ship a
registry. The survey found most integrations use an in-process map, which is what the rate
limiter already does and carries the same "correct on one instance" caveat; the multi-instance
integrations use either Redis `SET NX EX` or a database row with a unique constraint. Redis is
not in the locked stack.

## Decision

1. **Mechanism: ALTCHA v2 proof of work, self-hosted end to end.** The SPA bundles the `altcha`
   widget (no CDN); the backend issues and verifies challenges with the official Java library
   (`org.altcha:altcha`, MIT). The ALTCHA hosted services (Sentinel, Spam Filter API) are never
   called. Legal basis: legitimate interest in abuse prevention, Art. 6(1)(f) GDPR; no consent
   needed because nothing leaves the origin and no cookie is set. The draft privacy policy names
   the measure.
2. **Surfaces:** customer register, operator register, forgot-password, and booking create —
   for **every** caller of booking create, guest or signed in, so the verifier has no auth-state
   branch and a scripted account cannot bypass it. Login keeps the D-8 per-identity throttle and
   gets no challenge in this epic.
3. **Placement:** the challenge endpoint, the verifier and the registry are root-package edge
   concerns like `RateLimitFilter` (RV-BE-11). No Modulith module knows the challenge exists.
4. **Single-use registry in Postgres.** One Flyway table keyed by the challenge id with an expiry
   column; a solution is accepted only if `INSERT … ON CONFLICT DO NOTHING` claims the row (the
   invariant #2 idiom), and a scheduled sweep deletes expired rows. This is the one place this
   ADR departs from the rate limiter's in-memory precedent: a restart or a second instance must
   not reopen a replay window on a surface that creates accounts and holds inventory.
5. **Parameters:** challenge expiry 10 minutes with the widget refetching on expiry; the HMAC
   secret is an environment secret in the `RIVIERA_OPERATOR_PASSWORD` pattern with a random
   boot-time key as the dev fallback; difficulty (`cost`) is set from a phone measurement in the
   slice's prototype, not guessed.
6. **Widget posture:** the visible widget, auto-solving when the user focuses the form, with the
   "Protected by ALTCHA" attribution kept. The MIT licence permits hiding it; we keep it so the
   control explains itself.
7. **Kill switch:** one global `riviera.altcha.enabled` property, default `true`, in the
   `riviera.ratelimit.enabled` precedent. Off means the four endpoints accept requests without a
   challenge header; the widget is hidden in step.

## Considered options

- **reCAPTCHA v2/v3** — rejected: US processor, fingerprinting, consent required, DPA rulings.
- **Cloudflare Turnstile / hCaptcha** — rejected: still a third-party processor in the sign-up
  path; the dev host is Cloudflare-fronted today but prod will not be, and the choice should not
  depend on the hoster.
- **In-memory replay registry** (what most integrations and ALTCHA's own JS adapters do) —
  rejected for the reason in Decision 4. Acceptable for the rate limiter, whose failure mode is a
  weaker cap; not for a single-use credential whose failure mode is a free replay.
- **Hand-rolled verifier on the legacy v1 hashcash format** — rejected: the v3 widget speaks the
  v2 protocol (PBKDF2 with a signed parameter block), and the v1 format had a signature-binding
  CVE in 2025. The official library tracks the protocol; the registry is ours either way.
- **Headless / invisible solve** — rejected by product choice: the visible control tells the
  tourist why the button waits a second.
- **Challenge on every login** — deferred: the per-identity throttle already covers the
  brute-force case; an adaptive "challenge required once the bucket runs low" is the recorded
  phase-two shape.

## Consequences

- One small write per challenged request and one sweep; both sized like the existing sweeps.
- A new backend dependency (`org.altcha:altcha`, which needs `org.json` on the runtime
  classpath) and a new frontend dependency (`altcha`, ~34 kB gzipped). Both pinned.
- Integration tests solve challenges in Java in milliseconds, so no test bypass exists; the
  mocked Playwright suite never reaches the backend; the real-backend suite solves for real.
- If a Content-Security-Policy header is ever added, the Web Workers need a `worker-src`
  allowance.
- The production-hardening scale-out table gains no new row: the registry is already
  multi-instance safe. The rate-limiter row stays as it is.
- Proof of work raises the price of cheap automation; it does not stop a determined headless
  browser. That is proportionate for this marketplace and is the stated limit.

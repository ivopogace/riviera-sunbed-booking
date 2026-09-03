# ALTCHA proof of work for Riviera: library facts, DSGVO posture, and where integrations keep the replay registry

Findings behind ADR-0016. Gathered 2026-09-03 from primary sources (the ALTCHA GitHub
organisation, npm registry metadata, Spring Security source and Javadoc). `altcha.org` itself was
not reachable from the research sandbox, so every quote from it comes from a search snippet and
is marked **(snippet)**.

**TL;DR**

- The current widget (`altcha` 3.x) speaks ALTCHA's **v2 protocol** (PBKDF2/SHA-256 with a
  `cost`, a signed parameter block, `expiresAt`). The legacy v1 hashcash format is what most blog
  posts describe; it had a signature-binding CVE in 2025. Use the official Java library rather
  than hand-rolling.
- ALTCHA makes **replay protection the server's job**. No official library except the JS one
  ships a registry. Most integrations use an in-process map; the multi-instance ones use Redis
  `SET NX EX` or a DB row with a unique constraint and an expiry.
- The widget makes **no request to any ALTCHA host**: it fetches only the configured challenge
  URL. The footer is a plain hyperlink. Hiding logo and footer is permitted under MIT.

## 1. Packages

| Package | Latest | Licence | Notes |
|---|---|---|---|
| npm `altcha` (widget) | 3.2.2 | MIT | Web component; depends on `hash-wasm` only; README states ~34 kB gzipped (52 kB with all translations). Attributes in v3: `auto`, `challenge`, `configuration`, `display`, `language`, `name`, `theme`, `type`, `workers`. `hideLogo` / `hideFooter` go through `configuration` JSON, not attributes. |
| npm `altcha-lib` (headless) | 2.4.0 | MIT | `solveChallenge` runs on the calling thread; `solveChallengeWorkers` takes a `createWorker` factory, concurrency defaults to `navigator.hardwareConcurrency` clamped 1–16. Not needed when the widget is used. |
| Maven `org.altcha:altcha` | 2.0.3 | MIT | https://github.com/altcha-org/altcha-lib-java — Java 17+, `module-info`, `org.json` is `provided` and must be on the runtime classpath. v2 API: `createChallenge(CreateChallengeOptions)` with `.algorithm("PBKDF2/SHA-256").cost(n).hmacSignatureSecret(s).expiresInSeconds(n)`, `verifySolution(...)` returning `{verified, expired, invalidSignature, invalidSolution}`. Maven Central presence confirmed only indirectly (the GHSA advisory lists the coordinates); the first build verifies it. |

Sources: https://registry.npmjs.org/altcha/latest · https://registry.npmjs.org/altcha-lib/latest ·
https://github.com/altcha-org/altcha (README, `src/Widget.svelte`, `src/components/Logo.svelte`) ·
https://github.com/altcha-org/altcha-lib-java (README, `pom.xml`, `src/main/java/org/altcha/altcha/v2/Altcha.java`)

## 2. Wire format and the CVE

- **v2** (`altcha-lib/src/v2/types.ts`): challenge = `{ parameters: { algorithm, cost, keyPrefix,
  expiresAt?, data? … }, signature }`, signature = HMAC over the sorted-key JSON of `parameters`;
  payload = `{ challenge, solution: { counter, derivedKey, time? } }`; expiry check is
  `parameters.expiresAt < now`.
- **v1** (`src/v1/types.ts`): `{ algorithm, challenge, maxnumber, salt, signature }`, expiry as
  `<salt>?expires=<unix-seconds>`; payload base64 JSON `{ algorithm, challenge, number, salt, signature }`.
- **CVE-2025-68113 / GHSA-6gvq-jcmp-8959** (moderate): the v1 HMAC did not bind the expiry to the
  nonce, so a valid solution could be resubmitted with a changed expiry. Fixed in `altcha-lib`
  ≥ 1.4.1 and `org.altcha:altcha` ≥ 1.3.0 by a trailing delimiter on the salt. Relevant only if
  v1 is hand-rolled. https://github.com/altcha-org/altcha-lib/security/advisories/GHSA-6gvq-jcmp-8959

## 3. DSGVO posture

- README: "fully GDPR compliant", "cookie-free — no tracking, no fingerprinting, and no data
  collection". altcha.org compliance page **(snippet)**: sets no cookies, shares no data with third
  parties, "nothing that requires consent".
- Verified in source: the widget fetches only the configured `challenge` URL and, if set, a
  `verifyUrl` (default empty). The only `altcha.org` reference is an `<a href>` in the logo and
  the footer translation string. No image, script or beacon is loaded from an ALTCHA host.
- The ALTCHA **hosted** offerings (Sentinel, Spam Filter API) are separate products and a third
  party; ADR-0016 excludes them.

## 4. Replay registry: what ALTCHA says and what integrations do

**ALTCHA's guidance** (security-recommendations page, **snippet**): "your server must ensure that
each challenge is single-use … maintain a registry (e.g., in-memory store or database) of solved
challenges … set the expiration time between 20 minutes and 1 hour … your registry can discard
entries after the same duration."

**Official code:**

| Where | Registry |
|---|---|
| `altcha-lib` JS adapters (express, fastify, hono, nestjs, sveltekit, h3) | In-memory `CappedMap` by default, keyed by nonce; docs say "in distributed environments use Redis" with a `SET key 1 EX 3600` example. The check is get-then-set, **not atomic**. https://github.com/altcha-org/altcha-lib/blob/main/docs/store.md |
| `altcha-django` (official) | Django cache with atomic `cache.add(key, 1, timeout)`, TTL = `expiresAt − now + 30 s` skew; warns when the cache is per-process. https://github.com/altcha-org/altcha-django |
| WordPress plugin (official) | WP transients, 1 hour, get-then-set. |
| `altcha-lib-java`, `-go`, `-php`, `-py`, `-rb` | **No registry at all.** The Java example server does no replay tracking. |
| Sentinel (closed source) | Clustering requires external PostgreSQL + Redis **(snippet)**. |

**Survey of ~55 open-source integrations** (framework packages plus apps found by code search):

| Backend | Count | Examples |
|---|---|---|
| Redis `SET NX EX` / `GETDEL` | 15 | Quarkus seatReservation (`setnx`, 300 s), Go issuers (`SetNX`), several Python apps (`nx=True, ex=ttl`) |
| Framework cache abstraction | 13 | Django `cache.add` (atomic where the backend is), Laravel `has`→`put` (racy), Rails `write(unless_exist)` |
| Database table | 6 | contao (Doctrine table + expiry), typo3-altcha, navody.digital (unique index, `RecordNotUnique` = replay, cron purge), City of Munich `captchaservice` (Spring Boot, `sha256(signature)` + `expiresAt`) |
| In-process map | 11 | Caffeine `putIfAbsent` with `expireAfterWrite = expiry`, `ConcurrentHashMap`, Guava cache, `.NET` memory store defaults |
| Server session | 3 | GLPI, Zulip, Joomla plugin |
| None | ~17 | including the official Java example server and several Spring/Keycloak integrations |

**Patterns worth copying:** atomic add-if-absent (Redis `NX`, DB unique constraint, `putIfAbsent`)
with TTL equal to the challenge expiry plus a small clock-skew allowance. **Patterns to avoid:**
get-then-set (present in ALTCHA's own JS adapter), unbounded sets with no TTL.

**Conclusion for Riviera.** "Most people" use an in-process map, which is what our rate limiter
does and shares its single-instance caveat. The multi-instance-safe standard without Redis is a
small table with a unique key on the challenge id, an expiry column, and a sweep — which maps
onto this repo's `INSERT … ON CONFLICT DO NOTHING` idiom and its existing scheduled sweeps.
ADR-0016 takes that option.

## 5. Breached-password checking (evaluated, not adopted)

For the record, because it will be suggested again: Spring Security 7 still ships
`org.springframework.security.web.authentication.password.HaveIBeenPwnedRestApiPasswordChecker`
(spring-security-web, since 6.3) implementing `CompromisedPasswordChecker` (spring-security-core).
It sends a 5-hex-character SHA-1 prefix to `https://api.pwnedpasswords.com/range/` from the
server, sets no `User-Agent` or `Add-Padding` header, and **fails open** on `RestClientException`
(logs at ERROR, returns not-compromised). No Boot auto-configuration; a `CompromisedPasswordChecker`
bean is picked up by `DaoAuthenticationProvider` for the login path. The Pwned Passwords range API
is free, keyless and documented as unlimited **(snippet)**. The epic kept it out of scope; see
`auth-signin-register.md` § D-8.

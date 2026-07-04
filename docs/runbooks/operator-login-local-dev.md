# Logging in as an operator (local dev)

How to sign in as the bootstrap `operator` account against a locally running
backend + frontend. See also `docs/runbooks/operator-credential-provisioning.md`
for the credential-provisioning mechanism this relies on, and `riviera-stripe-payments`
/ `riviera-modulith` for the wider auth model.

## 1. Set a password before starting the backend

The bootstrap operator has **no login by default**. `OperatorCredentialInitializer`
(an `ApplicationRunner`) reads `RIVIERA_OPERATOR_PASSWORD` on every boot and, if set,
BCrypt-hashes it into the seeded `operator` row (migration `V16`). It's plaintext in
the env var, hashed at rest — never committed, never logged.

```bash
export RIVIERA_OPERATOR_PASSWORD=devpassword123   # any throwaway value for local dev
```

If this is blank/unset, the backend logs a `WARN` at startup and the operator write
API stays locked (login always `401`).

## 2. Start the backend and frontend

```bash
# backend (platform/) — see riviera-local-debug for the cloud-session Gradle recipe
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export RIVIERA_OPERATOR_PASSWORD=devpassword123
export APP_WEB_CORS_ALLOWED_ORIGINS="http://localhost:4200,http://localhost:8080"
gradle --no-daemon --console=plain bootRun

# frontend (frontend/)
npm start
```

`APP_WEB_CORS_ALLOWED_ORIGINS` isn't operator-specific — it's needed any time the
Angular dev server (`:4200`) calls the API (`:8080`) from a real browser, since the
default CORS allowlist is only the deployed GitHub Pages origin.

## 3. Sign in from the UI

There is **no dedicated `/operator/login` route** — the sign-in form is inline,
embedded in two pages, both driven by the shared `OperatorAuth` service
(`frontend/src/app/core/operator-auth.ts`):

| Route | Component | Notes |
|---|---|---|
| `http://localhost:4200/venue-admin` | `VenueEditor` | works without knowing a venue id |
| `http://localhost:4200/operator/{venueId}` | `OperatorConsole` | full console; shows the sign-in card automatically whenever `!operator.signedIn()` |

Fill in the inline card:

- **Username:** `operator`
- **Password:** whatever you set `RIVIERA_OPERATOR_PASSWORD` to (e.g. `devpassword123`)

Click **Sign in**. There's no redirect — the same component just re-renders its
authenticated view in place (the console's default child route is `beach-map`).

## 4. What happens under the hood

| Step | Request | Response |
|---|---|---|
| Submit form | `POST /api/auth/operator/login`<br>`{"username": "operator", "password": "..."}` | `200 OK`, body `{"username": "operator", "principalType": "OPERATOR"}`; sets an HttpOnly `SESSION` cookie (Spring Session, JDBC-backed, session id rotated on login) + a JS-readable `XSRF-TOKEN` cookie |
| Wrong credentials | same | generic `401` (RFC-7807, `INVALID_CREDENTIALS`) — no distinction between unknown user / bad password |
| Check session | `GET /api/auth/me` | `200` + `{"username", "principalType"}` when signed in; `401 UNAUTHENTICATED` when signed out (the frontend treats this as normal signed-out state, not an error) |
| Sign out | `POST /api/auth/logout` | `204 No Content`, invalidates the server session |

Every `/api/...` request from the frontend goes through `apiSessionInterceptor`
(`core/api-session.interceptor.ts`), which sets `withCredentials: true` and echoes
the `XSRF-TOKEN` cookie back as an `X-XSRF-TOKEN` header on mutating requests —
that's what makes the cookie-based session auth work cross-origin between `:4200`
and `:8080`.

## Troubleshooting

- **401 on every login attempt, even with the right password** — check the backend
  startup log for the `OperatorCredentialInitializer` WARN; it means
  `RIVIERA_OPERATOR_PASSWORD` wasn't set (or was blank) on that boot. Set it and
  restart the backend — the initializer re-stamps the password idempotently on
  every boot.
- **CORS error in the browser console** — `APP_WEB_CORS_ALLOWED_ORIGINS` doesn't
  include the origin the frontend is actually served from; add it (comma-separated)
  and restart the backend.
- **403 instead of 401 after logging in** — you're signed in as `operator` but
  hitting a venue you (the bootstrap account owns-all, so this shouldn't normally
  happen for `operator` itself) or a per-operator account doesn't own — see
  invariant #13 in `CLAUDE.md` (per-venue authorization).

# `/error` answers the problem contract (#1443)

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a request that ends on the container's `/error` dispatch answers `application/problem+json` in the app's
contract (status kept), and the request URI, a booking code on `/api/bookings/{code}` or `/booking/{code}`, appears
nowhere in the body (#7).

**Architecture:** `web` registers its own `ErrorController` (`ProblemErrorController`), which Boot's
`ErrorMvcAutoConfiguration` backs off for (`@ConditionalOnMissingBean`), as the Boot 4.1 reference
("Customizing Error Handling") prescribes for replacing `/error` wholesale. It builds the body with `ApiProblem.of`
and `ApiErrorHandler`'s status→code map, so there is one contract and one code table.

**Source of intent:** issue #1443 (owner decision + agent brief in its triage comment).

**Branch:** `bugfix/1443-error-dispatch-problem`

## Acceptance criteria

- [x] **AC-1:** Given a filter throws on `GET /api/bookings/{code}`, when the container dispatches `/error`, then
  the body is a 500 problem with code `INTERNAL_SERVER_ERROR` and no `path`/`instance`/`timestamp`, and the code is
  absent. *Seam:* HTTP on the shipped Tomcat · *Pinned by:*
  `ErrorDispatchProblemIT.aFilterThrownExceptionOnACodePathAnswersA500ProblemWithoutTheCode` (+ the POST `/cancel`
  twin, which crosses the CSRF-enabled SPA chain on the error dispatch).
- [x] **AC-2:** Given `StrictHttpFirewall` refuses `/api/bookings/{code};x=1` with `sendError(400)`, then the body
  is a 400 problem `INVALID_REQUEST` without the code. *Pinned by:*
  `ErrorDispatchProblemIT.aSendErrorOnACodePathAnswersItsStatusAsAProblemWithoutTheCode`.
- [x] **AC-3:** Given the same refusal on the SPA's `/booking/{code};x=1` with `Accept: text/html`, then the same
  problem body (no whitelabel page). *Pinned by:* `ErrorDispatchProblemIT.aSendErrorOnAnSpaPathAnswersTheSameProblemShape`.
- [x] **AC-4:** A direct `/error`, a non-error or unknown dispatched status answers 500; 413 keeps
  `PAYLOAD_TOO_LARGE`. *Pinned by:* `ProblemErrorControllerTest`.
- [x] **AC-5:** The existing error-contract and chain tests stay green (`ApiErrorHandlerTest`,
  `ErrorContractArchitectureTests`, `EndpointRoleGateCoverageTest`, `AuthSessionIT`, `RequestBodyCapIT`).

## Non-goals

- The MVC `ProblemDetail` path (`ProblemInstanceConfig` covers it); logging (#7 already held there).
- Tomcat's own pre-servlet rejections: they never reach `/error`; pinned as not echoing the code
  (`ErrorDispatchProblemIT.aRequestTomcatRefusesItselfNeverEchoesTheCode`), not reshaped.

## Risks

- **R-1:** Content negotiation turns a browser's `Accept: text/html` into a 406 → the response presets
  `application/problem+json`, so negotiation is skipped (AC-3).
- **R-2:** Spring fills a returned `ProblemDetail`'s `instance` with the request URI → `ProblemInstanceConfig`'s
  interceptor runs on controller-returned bodies too (`HttpEntityMethodProcessor`), asserted by the member set.
- **R-3:** `EndpointRoleGateCoverageTest` probes every app controller → it now skips any `ErrorController`.

## Siblings (mechanism: an error body echoing the request URI)

| Member | Verdict |
|---|---|
| MVC-written `ProblemDetail` `instance` | held by `ProblemInstanceConfig` (#1441) |
| Hand-built filter bodies (`SecurityProblemResponses`, `RateLimitFilter`) | constants, no URI |
| Boot `/error` JSON `path` | **leaked**, fixed here |
| Boot whitelabel HTML | no path; replaced here |
| Tomcat `ErrorReportValve` (pre-servlet 400) | no URI (Boot hides the report); pinned here |

## Open questions

### Resolved

- `/error` follows the full contract, not only `path` stripped: owner, 2026-10-03.
- Non-`/api` paths: the same problem body; the SPA route `/booking/:code` carries the code too, and the SPA never
  renders a server error page.

## Execution status

- [x] Phase 1 — reproduce (red): `ErrorDispatchProblemIT`.
- [x] Phase 2 — fix in `web` + docs (green).
- [ ] PR, CI, review gate (high), Sonar, plan removed.

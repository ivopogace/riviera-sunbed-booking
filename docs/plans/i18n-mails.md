# i18n S3 — transactional mails in the guest's language — Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** every guest mail (booking, stay, request outcome, cancellation, day refund, move, move
reminder, verification, reset) renders subject, body, support block and links in the locale the
guest booked or asked in, English for an absent or unknown one.

**Architecture:** the served-locale set becomes one `shared` type, `SiteLocale` (`web`'s `SpaLocale`
keys its shells off it). The SPA sends its build locale on booking/stay create and on the account
requests; `booking` stores it per booking row (V83); `BookingNotificationFacts` hands it to
`notification`, whose `SmtpMailer` renders from per-locale Spring message bundles and whose links
take the locale subpath.

**Source of intent:** issue #1770 and its triage Agent Brief (owner decision "Per booking",
2026-11-14); ADR-0030.

**Branch:** `claude/1770-i18n-mails-389f3c` (the session's worktree branch stands in for
`feature/<slug>`), off `origin/main` 4285fcda.

## Acceptance criteria

- [ ] **AC-1:** Given a booking created with `locale: "sq"`, when it is stored, then its row reads
  `sq`; given one created with no locale (or an unknown one), it reads `en`.
  *Seam:* `POST /api/bookings` / `POST /api/stays` → `BookingNotificationFacts`.
  *Pinned by:* `BookingLocaleIT` (create → `notificationInfo`/`stayConfirmationFacts` locale, every
  `SiteLocale` value stored, absent → `EN`).
- [ ] **AC-2:** Given each mail kind and each of `en`, `sq`, `it`, when `SmtpMailer` sends it, then
  subject and body are in that language (dates with that locale's month names, amounts in that
  locale's order and separator) and no bundle key leaks. *Seam:* `Mailer`.
  *Pinned by:* `SmtpMailerIT` (parameterized per kind × locale) + the English copy assertions kept.
- [ ] **AC-3:** Given the three bundles, then each has exactly the same keys and no lone apostrophe
  (MessageFormat escaping). *Seam:* the bundle files. *Pinned by:* `MailCopyBundleTest`.
- [ ] **AC-4:** Given a booking stored as `sq`, when any booking mail is built, then every link in it
  starts with the link origin + `/sq/` (booking view, pay, status, rebook map, discovery); an `en`
  booking's links are unchanged. *Seam:* the registry listeners → `Mailer` (mock outbox).
  *Pinned by:* `BookingLinksTest` + `RebookLinksTest` + each `*MailIT` asserting the locale and link
  for one non-English booking.
- [ ] **AC-5:** Given a register / forgot-password / verification-resend request carrying
  `locale: "it"`, then the mail is Italian and its link is `<origin>/it/account/verify|reset?token=…`;
  absent or unknown → English, root path. *Seam:* `/api/auth/customer/register`,
  `/api/auth/customer/forgot-password`, `/api/me/verify-email/request` → `MailSender`.
  *Pinned by:* `EmailVerificationIT`, `ForgotPasswordChallengeIT` (or a sibling IT), `CustomerRecoveryTest`.
- [ ] **AC-6:** The SPA sends `buildLocale()` on booking create, stay create, register,
  forgot-password and the verification resend. *Seam:* `BookingService`, `CustomerAuth`.
  *Pinned by:* `booking.service.spec.ts`, `customer-auth.spec.ts`; the locale e2e asserts a booking
  from `/sq/` posts `locale: "sq"`.
- [ ] **AC-7:** Structural net green; cross-module access stays on `api/` ports, `vocabulary` and
  id-based events (#11); no booking code or tokenized link logged (#7).

## Non-goals

- A preferred locale on the customer account; German (#1773); `ApiProblem` copy (#1771).
- The operator-approved mail: operators carry no locale, so it stays English.
- Moving the link origin to `riviera.web.public-origin` (the brief's wording): mails keep their
  bound origins (`riviera.notification.booking-link.base-url`, `riviera.recovery.link-base-url`), the
  same deployed origin; a config-key move is unrelated to language.
- The same-day promise in mails: the support block carries channels only; the promise is seasonal
  and answered live by `GET /api/support-contact`, so a mail read later cannot state it.

## Risks

- **R-1 open redirect / path injection:** a raw client value in a path. → The wire value is parsed
  to `SiteLocale` (enum lookup; unknown → `EN`); links take the enum's fixed `subPath`, never the
  input. `SiteLocaleTest` pins parsing.
- **R-2 a booking fails over a display preference:** → an unknown locale falls back to English, never
  a 400 (money path untouched).
- **R-3 DB check drifts from the enum:** `booking.locale` has `CHECK (locale IN ('en','sq','it'))`. →
  `BookingLocaleIT` inserts every `SiteLocale` value, so adding German without widening the check
  fails the build; noted for #1773.
- **R-4 MessageFormat apostrophes:** Italian is apostrophe-heavy; `alwaysUseMessageFormat` makes `'`
  an escape. → every literal apostrophe is `''`; `MailCopyBundleTest` rejects a lone one.
- **R-5 JVM default locale leaks into copy:** → `ResourceBundleMessageSource` with
  `fallbackToSystemLocale=false`, UTF-8; formatters take the explicit locale.
- **R-6 bearer credentials (#7):** no new log line; links still built where they were.
- **Flyway:** V83 claimed (orchestrator-assigned; no sibling migration).

## Modulith

- **`shared.SiteLocale`** (new): the locales the SPA is built and served in (code, subPath,
  `ofCode`). Admitted on ownership: the set is the platform build's (ADR-0030, `angular.json`); `web`
  serves its shells, `booking` stores a guest's, `notification` writes in it, `auth` links in it.
  `web` cannot own it (`booking → web` closes `web → auth → notification → booking → web`, the
  `ApiProblem` argument); `notification` cannot (`booking → notification` closes the cycle);
  `customer` would host a type it neither stores nor decides (the owner kept the locale off the
  account). `web`'s `SpaLocale` keys each shell off a `SiteLocale` (one list). Recorded in
  `RESPONSIBILITIES.md` §shared. S5 (#1772) may reuse it for the SSO return.
- **`booking`:** `booking.locale` column (sole writer); `CreateBookingCommand`/`CreateStayCommand`/
  `NewBooking` carry it; `BookingNotificationInfo`, `StayConfirmationFacts`, `StayMoveFacts` gain
  `locale` (vocabulary, read by `notification`). No event payload changes (ids only).
- **`notification`:** `Mailer`/`TransactionalMailService` sends take a `SiteLocale`;
  `MailSender.sendEmailVerification`/`sendPasswordReset` (api) take one; `BookingLinks`/`RebookLinks`
  take one; `EmailedLink.under(SiteLocale)` prefixes the subpath for both `notification` and `auth`.
- **`auth`:** parses the request's locale and passes it to `CustomerRecovery` → `MailSender`. No new
  grants (every module already has `shared`).

## FE↔BE contract

- `POST /api/bookings`, `POST /api/stays`: optional `locale` (`en`|`sq`|`it`).
- `POST /api/auth/customer/register`, `POST /api/auth/customer/forgot-password`: optional `locale`.
- `POST /api/me/verify-email/request`: optional body `{ locale }` (was bodiless).

## Template format (decision)

Spring `ResourceBundleMessageSource` over `mail/messages{,_sq,_it}.properties`, private to
`SmtpMailer`'s renderer (not a context bean, so it cannot shadow the context's `messageSource` or
trigger Boot's auto-config). Why: it is Spring's documented i18n mechanism with JDK
`ResourceBundle` fallback; English is the base file, so a locale without a key reads English;
UTF-8 via `setDefaultEncoding`; `MessageFormat` choice handles plurals (Italian "giorno/giorni").
A shared source with the SPA's XLIFF was rejected: the SPA's IDs are content hashes of template
copy and the mails' copy is not SPA copy; the bundle parity test gives the same "no missing
translation" guarantee the SPA build gives.

## Phases

- **Phase 0 — `SiteLocale`:** shared enum + `SpaLocale` keyed off it · red `SiteLocaleTest`.
- **Phase 1 — store the locale:** V83, command/request/`NewBooking`, facts carry it · red `BookingLocaleIT`.
- **Phase 2 — localized rendering:** bundles + `SmtpMailer` per locale · red `MailCopyBundleTest`, `SmtpMailerIT` per locale.
- **Phase 3 — locale through notification:** facts → listeners → `Mailer`, links under subpath · red `BookingLinksTest`, `*MailIT`.
- **Phase 4 — account mails:** `MailSender`/`CustomerRecovery`/controllers · red `EmailVerificationIT`.
- **Phase 5 — SPA:** send `buildLocale()` · red service specs + locale e2e.
- **Phase 6 — docs:** `RESPONSIBILITIES.md` §shared/§notification/§booking, ADR-0030 consequences.

## Execution status

**Stage pointer:** PR — CI, then review gate

**Next action:** open the PR, watch CI, mark ready, run the high-effort review.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — SiteLocale | ✅ | d56f7823 |
| 1 — store | ✅ | d56f7823 |
| 2 — rendering | ✅ | d56f7823 |
| 3 — notification path | ✅ | d56f7823 |
| 4 — account mails | ✅ | d56f7823 |
| 5 — SPA | ✅ | 71cc1b40 |
| 6 — docs | ✅ | docs commits |

Legend: blank = not started, ⏳ = in progress, ✅ = done.

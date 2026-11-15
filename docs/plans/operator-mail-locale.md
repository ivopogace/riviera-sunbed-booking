# Operator-approved mail in the operator's language Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** an approved operator receives the approval notice in the language it registered from, or
last picked in the console's language row; an operator with no stored language gets English.

**Architecture:** `operator` stores a nullable `operator.locale` (V84, CHECK over `shared.SiteLocale`'s
codes); the register writes it, a new self-service `auth` endpoint updates it through a new
`operator::api` write port, and the approval's guarded `UPDATE … RETURNING` hands it to
`OperatorApprovalMail`, which links the sign-in page under the locale's subpath and passes the locale to
`notification`, which renders `mail/messages*.properties`.

**Source of intent:** #1785, owner decision 2026-11-15 (option 1 + "change the language in the UI").

**Branch:** `feature/operator-mail-locale`

## Acceptance criteria

- [ ] **AC-1:** Given a registration posted with `locale: "sq"`, when an admin approves it, then the
  approval notice is the Albanian one and its link is `<origin>/sq/account/sign-in`. *Seam:* `POST
  /api/auth/operator/register` → `POST /api/admin/operators/{id}/approve` → `MailSender`. *Pinned by:*
  `OperatorLocaleIT.theNoticeFollowsTheRegistrationLocale`
- [ ] **AC-2:** Given a registration with no or an unknown locale, or a row from before V84 (NULL), when
  approved, then the notice is English at the root. *Seam:* same. *Pinned by:*
  `OperatorLocaleIT.aRegisterNamingNoServedLocaleStoresEnglish`, `.aRowWithoutALocaleReadsAsEnglish`
- [ ] **AC-3:** Given a signed-in operator, when it `PUT`s `/api/auth/operator/locale` `{"locale":"it"}`,
  then its row stores `it` (204) and a later approval mail is Italian. *Seam:* `OperatorLanguage` port
  through the endpoint. *Pinned by:* `OperatorLocaleIT.theConsoleChoiceIsStoredAndTheNoticeFollowsIt`
- [ ] **AC-4:** An unknown or missing code → `400 INVALID_REQUEST`, nothing written; anonymous → 401;
  a customer session → 403 at the chain (no handler; a customer's name must never update an operator
  row). *Seam:* the endpoint. *Pinned by:* `OperatorLanguageControllerTest`
- [ ] **AC-5:** The notice renders in every `SiteLocale` with no English copy, key or placeholder left.
  *Seam:* `SmtpMailer#sendOperatorApproved`. *Pinned by:* `SmtpMailerLocaleIT` (new kind),
  `SmtpMailerIT.deliversOperatorApprovedEmailOverSmtp`, `MailCopyBundleTest`
- [ ] **AC-6:** The register sends the build locale; a language pick in the console's account menu
  saves it as the operator's own before the page loads under the new subpath, and a failed or slow
  save never blocks the switch. *Seam:* `OperatorAuth.saveLocale`/`register`, `OperatorAccountChip`.
  *Pinned by:* `operator-auth.spec.ts`, `operator-account-chip.spec.ts`, `locales.e2e.ts`

## Non-goals

- Using the stored language for the console UI or sign-in landing (the device-local choice keeps
  deciding which build loads).
- A customer-account language; German (#1773 adds `de`, widening `operator_locale_check` in V85).

## Risks

- **R-1:** a customer principal reaching the endpoint would `UPDATE operator WHERE username = <its
  email>` → `hasRole(OPERATOR)` matcher in `SecurityConfig`, pinned by the 403-without-handler test.
- **R-2:** the save is in flight when the page navigates away and is cancelled → the pick awaits the
  save (bounded by `LOCALE_SAVE_TIMEOUT_MS`), then navigates; any failure is swallowed.
- **R-3:** the console has no language row (the tourist chrome's row is the only one) → a Language
  group in the console account menu, beside Console theme; the tourist row stays guest-only, so a
  tourist page never builds the operator session.
- **R-4:** Flyway: V84 claimed (orchestrator); #1773 takes V85 and merges second.

## Modulith

- New `operator.api.OperatorLanguage` (`setLocale(username, SiteLocale)`), consumer `auth`'s
  `OperatorLanguageController`; implemented by `OperatorAccountService`. `operator` stays sole writer
  of `operator`. `auth` already holds `operator::api`; no grant changes.
- `OperatorRegistration.register` and `ApprovalOutcome.Approved` gain a `SiteLocale`; `MailSender` /
  `Mailer.sendOperatorApproved` gain a `SiteLocale`.

## FE↔BE contract

- `POST /api/auth/operator/register` body gains `locale` (optional; unknown → English).
- New `PUT /api/auth/operator/locale` `{ locale }` → `204`; `400 INVALID_REQUEST` for an unserved code.

## Phases

- **Phase 0 — storage + register:** V84; register stores the locale · red `OperatorLocaleIT`
- **Phase 1 — mail:** the approval outcome carries it; notice + link follow it · red
  `OperatorApprovalMailTest`, `SmtpMailerLocaleIT`, `OperatorApprovalMailIT`
- **Phase 2 — self-service endpoint** · red `OperatorLanguageControllerTest`, `OperatorLocaleIT`
- **Phase 3 — SPA:** register sends the locale; the console's Language rows save it · red
  `operator-auth.spec.ts`, `operator-account-chip.spec.ts`
- **Phase 4 — docs:** RESPONSIBILITIES §operator/§auth/§notification/§web, ADR-0030

## Execution status

- [x] Phase 0 · [x] Phase 1 · [x] Phase 2 · [x] Phase 3 · [x] Phase 4 — scoped BE tests + structural
  net green locally; FE unit suite green except pre-existing Windows-only failures; PR next.

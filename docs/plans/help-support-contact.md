# Help page and support contact Implementation Plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** a tourist or operator can find a person to contact: a `/help` page, a Help row in the
tourist menus, a Help link in the shared footer, a contact block on the booking view, a contact
group in the console account menu and a contact line in both confirmation mails, all read from one
configured support-contact source that renders nothing for a channel with no value.

**Architecture:** the source is configuration bound once in `notification`
(`riviera.notification.support.email` / `.whatsapp`, env `RIVIERA_SUPPORT_EMAIL` /
`RIVIERA_SUPPORT_WHATSAPP`), validated at boot, held as `notification.application.SupportContact`.
`SmtpMailer` renders it; a public `GET /api/support-contact` in `notification/adapter/in` serves
it to the SPA, which reads it through one `core/support-contact.ts` service. `notification` owns
it because the mails are its only backend consumer and no domain module may depend on it; serving
from its own `adapter/in` needs no published port.

**Source of intent:** issue #1735 and the owner's decisions comment of 2026-11-14.

**Branch:** `claude/1735-help-support-contact-9fa2a3`

## Acceptance criteria

- [ ] **AC-1:** Given both values configured, when the SPA reads the support contact, then it gets
  the mailbox and the WhatsApp number with its `https://wa.me/<digits>` link. *Seam:*
  `GET /api/support-contact` · *Pinned by:* `SupportContactControllerTest`
- [ ] **AC-2:** Given no value configured (or blank), then the read answers both channels `null`
  and every surface renders no channel and no placeholder. *Seam:* `GET /api/support-contact`,
  `SupportContactChannels`, `HelpPage`, `BookingView`, `OperatorAccountChip` · *Pinned by:*
  `SupportContactControllerTest`, the components' specs
- [ ] **AC-3:** Given a malformed mailbox or number, when the app boots, then binding fails and
  the message names the key, never the value. *Seam:* `SupportContactProperties` · *Pinned by:*
  `SupportContactPropertiesTest`
- [ ] **AC-4:** Given today in `Europe/Tirane` is in May–October, then the read says
  `sameDayReply: true` and the help page shows "We answer the same day, 08:00–20:00, May to
  October."; outside, `false` and no time promise (#6). *Seam:* `SupportContact#sameDayReplyOn`,
  `HelpPage` · *Pinned by:* `SupportContactTest`, `help-page.spec.ts`
- [ ] **AC-5:** Given a channel configured, when a lone booking or a stay is confirmed by mail,
  then the body names the configured channels; with none, the body carries no contact line.
  *Seam:* `Mailer` (`SmtpMailer`) · *Pinned by:* `SmtpMailerIT`
- [ ] **AC-6:** The tourist sheet and popovers carry a Help row and the shared footer (tourist and
  console) a Help link to `/help`, opening a new tab like the legal rows. *Seam:*
  `LegalMenuRows`, `LegalFooter` · *Pinned by:* their specs + `help.e2e.ts`
- [ ] **AC-7:** The console account menu shows a "Contact Riviera" group with each configured
  channel. *Seam:* `OperatorAccountChip` · *Pinned by:* `operator-account-chip.spec.ts`

## Non-goals

- A venue phone on the booking view and mail: the venue profile carries no phone, and adding one
  is a venue field plus a migration. Follow-up issue.
- The contact line in the other booking mails (cancellation, payment-due, moved, …): the issue
  names the confirmation mail.
- Supplying the two values (owner; the mailbox waits on #370).

## Risks

- **R-1:** a placeholder address shipped before the values exist → no default value; blank binds
  to absent; every surface renders per channel (AC-2).
- **R-2:** an anonymous read leaking anything → it answers configuration only, no principal, no
  id; `permitAll` like the venue catalogue, listed in `EndpointRoleGateCoverageTest`.
- **R-3:** the season decided in the browser's or the JVM's zone → the server decides it from the
  injected `Clock` in `Europe/Tirane` (#6).
- **R-4:** a typo'd number producing a dead `wa.me` link → digits-only shape check at boot (AC-3).

## FE↔BE contract

- **`GET /api/support-contact`** (anonymous) → `{ email: string | null, whatsapp: { number:
  string, url: string } | null, sameDayReply: boolean }`; `number` is `+<digits>` for display,
  `url` the `wa.me` link.

## Phases

- **Phase 1 — backend source + read + mail:** `SupportContactPropertiesTest`,
  `SupportContactTest`, `SupportContactControllerTest`, `SmtpMailerIT` red first.
- **Phase 2 — frontend:** `core/support-contact.ts`, `shared/support-contact-channels.ts`, the help
  page and route, menu/footer rows, booking-view block, account-menu group; unit + a11y + contrast
  specs; mocked e2e `help.e2e.ts`.

## Execution status

- Phase 1: done (config, read, mail lines; structural net green).
- Phase 2: done (help page + route, menu/footer rows, booking-view block, account-menu group,
  unit/a11y/contrast specs, `help.e2e.ts`).
- Venue phone: follow-up #1746.
- Next: PR, CI, review gate, Sonar.

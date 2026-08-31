# Colour-literal audit — which hex/rgba positions want `--riv-*` tokens

**Status:** living ledger. Enumerated against `main` `e801063` (2026-08-31).
**Source of intent:** [#836](https://github.com/ivopogace/riviera-sunbed-booking/issues/836),
the generalization-audit residue from #829 (PR #833). Prior slices that cut families out
of this population: **#829** (the negative/red admin family, PR #833), **#835** (the accent
teal ink + tint family, PR #838), **#855** (the operator console's error ink, PR #856).

> **This file is not a design record.** `docs/design/README.md` governs the `.dc.html`
> artboards — approved-look snapshots that are deliberately *never* rewritten to track the
> shipped app. This ledger is the opposite: it is **maintained**, and every slice that cuts
> a family from the population updates the family's row to `done` with its PR. It lives here
> because #836 asked for it here, next to the design substrate it reasons about.

## Why a ledger and not a sweep

`riviera-tailwind` is explicit that components consume `--riv-*` tokens and never palette
literals, and that a colour position uses the **named** utility once the token is registered.
287 positions predate or sidestep that. But "migrate all 287" is the wrong instruction, and
the two slices already cut prove why: #835's central finding was that one literal (`#0a4f5e`)
was **not one role** — it split three ways by *what it is painted on*, and each part wanted a
different answer. A find-and-replace would have flipped an ink light-on-light in dark mode.

So the unit of decision is the **family**, and a family is defined by *value + role + painted-on
surface*, not by value alone. This file records the verdict per family.

## The population

```bash
grep -rnoE '(text|bg|border|fill|stroke|shadow)-\[(#[0-9a-fA-F]{3,8}|rgba?\()' \
  frontend/src --include=*.ts --include=*.html
```

**287 occurrences outside `*.spec.ts`, across 51 files and 111 distinct values.**

| Folder | n | | Folder | n |
|---|---:|---|---|---:|
| `operator/` | 115 | | `venue/` | 20 |
| `booking/` | 75 | | `auth/` | 8 |
| `shared/` | 58 | | `pages/` | 6 |
| app shell (`app.html`, `app.ts`) | 5 | | | |

> **#836's headline numbers are stale and this table supersedes them.** The issue says
> "380 occurrences, 336 outside `*.spec.ts`, across 62 files"; #835 (PR #838, `27a3b40`)
> has landed since. The shape of the finding is unchanged — the count is not.

The distribution is the first useful fact: **71 of the 111 values are used exactly once**,
and only 3 of those 71 match a registered token. The count is carried by a short head —
the ten largest values are 138 of the 287 — and the tail is per-state palettes, which are
a different question entirely (class **S** below).

## The five classes

Every family sorts into one of five classes. The class determines whether the family is
tokenisable at all, and what proof its slice owes.

### Class T — tokenisable ink: plain position, registered token, matching role

A non-`/opacity` position whose value **already equals a registered token**, whose *role*
matches that token's role, on a surface where the token's per-theme resolution is correct.
Substitution is byte-identical; the slice owes a computed-style proof that the utility
actually generated, and nothing more.

| Family | n | Token | Verdict | Status |
|---|---:|---|---|---|
| `text-[#a3160e]` in `operator/` (9 files) | 32 | `--riv-error-ink` | **migrate** — hosts are porcelain-pinned, where the token resolves `#a3160e` | **done — #855, PR #856** |
| `#0a6e85` in `operator/` | 16 | `--riv-pop-accent` | **migrate, but name the role first** — value-correct, role wrong: `--riv-pop-accent` is the *popover* accent. Either register a console-accent token or widen that token's contract | open → #848 |
| `#0a2a33` (`text-`) | 5 | `--riv-ink` / `--riv-card-ink` / `--riv-pop-ink` | **migrate** — but three tokens share the value, so each site must be assigned to the one whose *surface* it sits on | open → #849 |
| `rgba(12,42,51,·)` inks/borders (`.66`, `.78`, `.14`, `.1`) | 9 | `--riv-ink-faint`, `--riv-card-ink-soft`, `--riv-chip-border`, `--riv-pop-divider` | **migrate** — same one-value-many-tokens caveat | open → #849 |

### Class F — fixed-fill pair: an ink over a surface that does not theme

The #835 precedent, and the failure mode it exists to prevent: a **themed** ink over a
**fixed** fill drifts between themes (`booking-view.contrast.spec.ts:90` carries the rule).
These families must move **as a pair**, onto tokens declared **once** with no dark override
— exactly as `--riv-solid-btn-ink` is.

| Family | n | Verdict | Status |
|---|---:|---|---|
| Form-error skin: `bg-[#f6e8e7]` + `text-[#a3160e]` (`booking-dialog:311`, `booking-pay:255`, `my-bookings:290`) | 6 | **new theme-invariant token pair.** The themed `--riv-error-ink` is *wrong* here — it resolves `#ffa9a1` in dark, over a fill that stays `#f6e8e7`: light on light | open → #850 |
| Solid outline-button skin: `#f4f6f7` fill, `#e7ebec` hover, `rgba(255,255,255,0.7)` border, `#a3372a` danger ink | 9 | **new theme-invariant tokens**, one family. Its teal ink already moved to `--riv-solid-btn-ink` in #835 | open → #851 (recorded on #836 by the maintainer) |

### Class O — `/opacity` modifier: tokenising is a computed-value change

**44 of the 287 positions carry Tailwind's `/opacity` modifier** (`bg-[#2bb8d4]/20`). That
compiles to `color-mix()`, so replacing the literal with a pre-composed `rgba()` token — the
form `--riv-danger-*` and `--riv-accent-*` set the precedent for — is *not* a substitution:
it changes the computed value. Every family here owes the before/after computed-style diff
#835 used, and none is a candidate for a mechanical pass.

| Family | n | Note | Status |
|---|---:|---|---|
| `#0c2a33/·` in `operator/` | 17 | Also a **near-duplicate**: `#0c2a33` is `rgb(12,42,51)`, the base of the `--riv-ink-*` rgba family, but `--riv-ink` itself is `#0a2a33`. Decide whether the two-unit difference is intent or drift before tokenising | open → #852 |
| `#2bb8d4/·` + `#0e8aa8/·` (map/editor selection chrome) | 8 | Already enumerated on #836 by the maintainer | open → #852 |
| `#a3160e/·` (borders `/25 /30 /40 /50`, fill `/10`) | 7 | The alert-red's tint half; the ink half is class T | open → #852 |
| `#d9861a/·`, `#f0aa2e/·`, `#0e6e46/·`, `#a3372a/·` | 9 | Amber + green status tints | open → #852 |

### Class R — role mismatch: the value matches a token whose *role* is different

Substituting here would be a **role confusion** — the value happens to coincide, the meaning
does not. Each needs its own token, not the coincidental one.

| Family | n | Coincides with | Why not that token | Status |
|---|---:|---|---|---|
| `border-[rgba(255,255,255,0.4)]` (15 of 17; 2 are `bg-`) | 17 | `--riv-inset-fill` | That is a **fill** token (dark theme: `rgba(255,255,255,0.08)`). A border wants a border token; none of this value exists | open → #853 |
| `bg-[#a3160e]` + `text-white` (`confirm-panel:9`, `requests-tab:172`) | 2 | `--riv-error-ink` | An **ink** token used as a fill. The white ink on it is fixed, so the pair is theme-invariant | open → #854 |
| `#0a5f74` solid fills | 7 | `--riv-cta-grad` (end stop) | A gradient stop is not a fill token | open → #854 |
| `#8a5410` warn ink, `#8a3a2a`, `#0a5e7a`, `#334a52`, … | ~20 | — | No token at all; these are genuine new-token candidates once their role is named | open |

### Class S — per-state palettes and one-offs: exempt for now

The tail. A value inside a composite arbitrary variant expression (`[&.premium]:bg-[#…]`)
is **exemption class 2**, and several have specs pinning the class→colour mapping. Tokenising
a *state palette* is a different question from tokenising an ink: it wants one token per
**state**, named for the state — which is a palette design pass, not a migration.

| Component | distinct values | Note |
|---|---:|---|
| `shared/status-chip.ts` | 17 | Nine per-state fill/border/ink triples |
| `booking/booking-view.ts` | 12 | Per-status panel palettes |
| `shared/amenity-chip.ts` | 5 | |
| `venue/availability-calendar.html` | 5 | |
| `venue/day-availability.ts` | 3 | |
| `shared/confirm-panel.ts` | 3 | Tone palettes |
| others (11 components) | ~14 | |

**One recorded deliberate deviation stays literal, permanently:** `app.html:6`'s sign-out
bar (`#b3261e` on solid white, both themes). The reason is written at `app.ts:59–69` — it is
a safety notice about a session that may still be open on a shared device, so legibility
outranks theme harmony. **Exemption class 1.** Measured 6.5:1, past AA. Do not sweep it.

## How to cut a slice from this ledger

Each family becomes its own issue and its own PR, largest inconsistency first. The pattern
#829 and #835 established, and the proof each slice owes:

1. **Name the painted-on surface for every site** before choosing a token. This is the step
   that splits a family; skipping it is how #835's `#0a4f5e` would have gone wrong.
2. **Move any spec constant pinning the literal into `src/testing/glass-tokens.ts` first**,
   so the contrast specs read the token rather than restating it (#835's R-5).
3. **A unit contrast spec** proving the value clears its WCAG floor on every surface it
   lands on — and, where the value moves, that the movement is bounded and does not cross
   a floor the outgoing value cleared (#835's R-7, found late at the review gate).
4. **A mocked e2e `toHaveCSS` against a real render.** This is the only thing that catches a
   token declared without its `@theme inline` row: the class stays in the markup, the paint
   silently does not change, and no unit spec can see it. Where the family relies on subtree
   theme pinning, force a `dark` document theme and assert the ink holds.
5. **Update this ledger's row** in the same PR — `done`, with the PR number.

## Should the exemption classes become a lint rule?

Not yet — #836's step 4, deliberately deferred. A rule is worth writing when the residue is
a **boundary** rather than a backlog. Today classes T + F + O + R are ~120 positions of live
work; class S is a palette design pass nobody has scheduled. Revisit once T, F and R are
`done` and the remaining literals are all class S and the one class-1 exemption — at that
point the rule is "a colour literal must sit inside an arbitrary variant expression or carry
a recorded deviation", which is checkable and would hold.

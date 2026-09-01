# Colour-literal audit — which hex/rgba positions want `--riv-*` tokens

**Status:** living ledger. Enumerated against `main` `e801063` (2026-08-31).
**Source of intent:** [#836](https://github.com/ivopogace/riviera-sunbed-booking/issues/836),
the generalization-audit residue from #829 (PR #833). Prior slices that cut families out
of this population: **#829** (the negative/red admin family, PR #833), **#835** (the accent
teal ink + tint family, PR #838), **#855** (the operator console's error ink, PR #856),
**#850** (the tourist form-error skin's theme-invariant pair, PR #857), **#851** (the solid
outline-button skin's theme-invariant family, PR #859), **#854** (the nine solid button/badge
fills under fixed white ink, PR #860), **#861** (merging that family's two brand teals onto one,
PR #862), **#848** (the operator console's accent ink, PR #863), **#864** (the console's negative
ink, PR #866), **#858** (the three fixed-fill state skins, PR #867), **#869** (`outcome-card`'s two tone glyphs onto the medallion skin, PR #NN).

> **This file is not a design record.** `docs/design/README.md` governs the `.dc.html`
> artboards — approved-look snapshots that are deliberately *never* rewritten to track the
> shipped app. This ledger is the opposite: it is **maintained**, and every slice that cuts
> a family from the population updates the family's row to `done` with its PR. It lives here
> because #836 asked for it here, next to the design substrate it reasons about.

## Why a ledger and not a sweep

`riviera-tailwind` is explicit that components consume `--riv-*` tokens and never palette
literals, and that a colour position uses the **named** utility once the token is registered.
287 positions predate or sidestep that. But "migrate all 287" is the wrong instruction, and
the slices already cut prove why: #835's central finding was that one literal (`#0a4f5e`)
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
| `#0a6e85` **inks** in `operator/` | 12 | `--riv-console-accent-ink` (**new**) | **migrated onto its own token, not the coincidental one.** Value-correct, role wrong: `--riv-pop-accent` is the *popover* accent, and `--riv-solid-fill-brand` is a fill. **Option A over B**, on mechanical grounds: `@theme inline` makes a utility resolve `var(--riv-*)` at the point of use, so widening `--riv-pop-accent` would route the console's ink through the variable the popover family's theme blocks override — popover retuning would move payout figures. Angular's emulated encapsulation does not scope custom properties, so naming is the only separator. Declared **once**: every consumer is porcelain-pinned, so a dark branch is unreachable by construction, and no render can tell a themed token from an unthemed one inside a pinned subtree | **done — #848, PR #863.** n corrected 16 → 12: four were `bg-` fills, a different role, and left with #854 |
| `#0a2a33` (`text-`) | 5 | `--riv-ink` / `--riv-card-ink` / `--riv-pop-ink` | **migrate** — but three tokens share the value, so each site must be assigned to the one whose *surface* it sits on | open → #849 |
| `rgba(12,42,51,·)` inks/borders (`.66`, `.78`, `.14`, `.1`) | 9 | `--riv-ink-faint`, `--riv-card-ink-soft`, `--riv-chip-border`, `--riv-pop-divider` | **migrate** — same one-value-many-tokens caveat | open → #849 |

### Class F — fixed-fill pair: an ink over a surface that does not theme

The #835 precedent, and the failure mode it exists to prevent: a **themed** ink over a
**fixed** fill drifts between themes (`booking-view.contrast.spec.ts:90` carries the rule).
These families must move **as a pair**, onto tokens declared **once** with no dark override
— exactly as `--riv-solid-btn-ink` is.

| Family | n | Verdict | Status |
|---|---:|---|---|
| Form-error skin: `bg-[#f6e8e7]` + `text-[#a3160e]` (`booking-dialog:311`, `booking-pay:255`, `my-bookings:290`) | 6 | **new theme-invariant token pair.** The themed `--riv-error-ink` is *wrong* here — it resolves `#ffa9a1` in dark, over a fill that stays `#f6e8e7`: light on light | **done — #850, PR #857** |
| Fixed-fill **state skins** on themeable hosts: the outcome medallion, the amenity chip, the dialog step badge | 15 | **Three families, cut by FORM, with the per-state class ternary as the atomic unit.** The how-many-pairs answer, and the reasoning, are in the note below this table | **done — #858, PR #867** (`--riv-medallion-*`, `--riv-amenity-*`, `--riv-step-*`). n corrected 6 → 15 across 8 sites |
| Amber **notice banner**: `bg-[#fcf0d9]` + `text-[#8a5410]` (`withheld-email-notice:29`, `privacy-policy.html`, `terms-of-service.html`) | 6 | **the same pair as the medallion's waiting state, on a different FORM** — a rectangular block with *accessible text*, so unlike the medallion it genuinely owes AA (5.54:1 today). Surfaced by #858's out-of-family sweep, which had to name these sites to prove it did not over-reach onto them. Wants its own theme-invariant pair; do **not** reuse `--riv-medallion-waiting-*`, whose whole population is decorative | open → #868 |
| `shared/outcome-card.ts`'s two tone glyphs | 2 | **the medallion FORM again — and the intake grill inverted the question.** Answer: converge. See the note below the table; n corrected 4 → 2 (the border and inset shadow counted here are class R's #853, not this family's) | **done — #869, PR #NN** |
| Solid outline-button skin: `#f4f6f7` fill, `#e7ebec` hover, `rgba(255,255,255,0.7)` border, `#a3372a` danger ink (+ the `rgba(200,90,60,0.5)` danger border) | 13 | **new theme-invariant tokens**, one family. Its teal ink already moved to `--riv-solid-btn-ink` in #835. The themed alternatives measure 1.69:1 (`--riv-danger-ink`) and 1.52:1 (`--riv-accent-ink`) over the fixed fill | **done — #851, PR #859.** n corrected 9 → 13: the danger border was uncounted, and the `rgba(255,255,255,0.7)` border sits on all three buttons (on the `btnOutline` variant, not the shared `BTN_OUTLINE` base) |


> **F-3's how-many-pairs answer (#858).** The ticket asked whether its six inks were "one skin with
> per-state values, or genuinely separate pairs", and warned against assuming a shared ink value
> means a shared role. The answer is **three families**, and the cut runs on two rules:
>
> 1. **By form, never by value.** The six inks carry two values across **three different forms** — a
>    round decorative outcome medallion, a labelled amenity tag, and a numeral step badge on the
>    dialog's teal header. A value-led cut would have merged three roles and split each of them; it
>    is the same fork #848 and #864 each settled, and the `--riv-solid-fill-*` "grouped by FORM"
>    precedent applied a third time.
> 2. **A per-state class ternary is atomic.** Three of the six sit inside `[class]` or `computed()`
>    ternaries whose *sibling branch* is also a literal. Tokenising one branch leaves
>    `state() === 'awaiting' ? 'bg-[#fcf0d9] text-[#8a5410]' : 'bg-riv-medallion-positive-fill …'` —
>    a worse artifact than either whole option, and the exact mis-cut #858 was itself re-cut to undo.
>
> **Three corrections to the ticket, found by the intake grill and the generalization sweep:**
>
> - **Five of the six inks are `aria-hidden`, not three.** `booking-dialog:120` is not "the active
>   segmented-control segment" — it is the decorative step **number** badge, with the meaning on the
>   sibling `.step-label`. And `failure-panel:27` **is** exempt after all: all three call sites
>   (`venue-map.html:350`, `:360`, `home.html:124`) pass `aria-hidden="true"`. So the **amenity chip
>   is the only AA-owing site in the whole class**, which is why it stayed in scope — dropping it
>   would have left a slice of pure exemptions with no AA proof at all.
> - **The medallion population is five sites, not four.** Enumerating the medallion *form* (a
>   `rounded-full` centred box of ~52–66px) rather than the ticket's value list found
>   `request-confirmation.ts:15`, the amber twin of `booking-pay:114`'s waiting branch. The ticket
>   could not have found it by value: its ink is `#8a5410`, neither of the two it enumerated.
> - **The amenity chip is class F, not class S.** `testing/chip-fills.ts` filed it under class S;
>   a *two-variant* tag whose ink+fill+border sit on themeable hosts is class F's shape exactly.
>   Class S is the *nine-state* `status-chip` palette — a design pass, which this is not.
>
> **Measured, per AC-1** (current : the themed alternative resolved in dark):
> medallion positive 6.20 : 1.41 · waiting 5.54 : 1.63 · negative 5.62 : **1.54** (the very number
> #850 measured) · amenity tag 8.37 : 1.04 · water 6.00 : 1.37 · step active 7.24 : 1.65 · step idle
> 5.11 (white on the fill, which cannot theme). Borders, non-text chrome under 3:1 and carried across
> unchanged against #834: 1.24 / 1.15 / 1.17.
>
> **F-5's answer (#869), and why it is not the answer the ticket expected.** The ticket asked
> whether the three landed-state surfaces should look alike, framing `outcome-card` as a third way
> that broke ranks. The intake grill checked that framing against `docs/design/` and found it
> **inverted**: the artboards drew *every* medallion as a translucent brand tint —
> `rgba(43,184,212,0.18)`/`#0a6e85` positive (`riviera-sign-in.dc.html:127,136`,
> `…v3.dc.html:538`), `rgba(240,170,46,0.18–0.2)`/`#a86a12` waiting (`:145`, `:642,676`) — and
> **`#a86a12` appears 11 times across three artboards while `#8a5410`, `#fcf0d9` and `#d9f2f7`
> appear zero times in any of them.** So `--riv-medallion-*` tokenised the *drifted* values and
> `outcome-card` was the one site still painting the approved look.
>
> The split has a cause, not just a history: the other four sites took the **opaque-fill S7924
> retune** that `shared/status-chip.ts` states outright ("Fills are OPAQUE SOLID, never rgba — the
> css:S7924 treatment"), and `outcome-card` never did because its glyph is `aria-hidden` and so
> nothing ever forced an AA proof onto it.
>
> **Verdict: converge — ratify the as-built retune as the design** (maintainer, 2026-09-01). Both
> tones move whole onto `--riv-medallion-positive-*` / `--riv-medallion-waiting-*`; the artboard
> lines get the `as-built diverges` pointers `docs/design/README.md` prescribes, which #858 owed and
> did not write. Two things this closes and one it opens:
>
> - **A defect, not a preference.** The `pending` tone pinned a fixed `#a86a12` over a tint that
>   composited onto the **themed** card: 2.82:1 on riviera and **2.46:1 in dark**. Class F's failure
>   mode inverted — a fixed ink over a fill that themes — and invisible to every guard because
>   `aria-hidden` had been doubling as an absence of proof. `auth-page.contrast.spec.ts` now holds
>   both glyphs to 1.4.11's 3:1, composited per theme stop.
> - **What convergence cost.** The `success` tone themed *correctly* (4.83–6.67:1 light,
>   7.03–7.69:1 dark) because both halves themed together — the app's only theming medallion. It is
>   deliberately gone. Recorded at the declaration so a later sweep does not rediscover it as a bug.
> - **The ticket's class-O attribution is wrong, and it changes the proof owed.** The `pending` fill
>   was `bg-[rgba(240,170,46,0.2)]` — an *arbitrary rgba literal*, not an `/opacity` modifier.
>   Tailwind v4 compiles `/N` to `color-mix(in oklab, …, transparent)` but emits an arbitrary rgba
>   verbatim, so this position was never in #852's class-O population (which enumerates the slash
>   form: `payouts-tab.html:165`, `daily-view-tab.html:142`). The substitution carries **no**
>   class-O computed-value change; the movement it does carry is the deliberate repaint above.
>
> **Adjacent, deliberately not taken:** `riviera-sign-in.dc.html:153`'s "Pending review" status chip
> is `#a86a12`/`rgba(240,170,46,0.2)` too, while the shipped `status-chip.ts` `chip--pending` is
> `#8a5410`/`#fceed5` — the same as-built divergence on the **status-chip** family, which is class
> S's nine-state palette and owes its own design pass. Named here so the next sweep does not read
> its absence as an oversight.
>
> **Found by #869's own generalization audit, and filed rather than folded in:** sweeping the
> *mechanism* (a fixed hex ink sharing a class string with a translucent fill on a themeable host)
> rather than the medallion form turned up `shared/beach-map-canvas.html:20,35` — the Fit/100% zoom
> toggle, **accessible text** at **1.16–1.22:1** on the dark map wash, with no contrast coverage at
> all. Worse than the finding that started the sweep, and a different family → **#870**.

> **Three families the sweep surfaced that #858 deliberately did not take**, each now a row of its
> own below rather than a silent omission: the amber **notice banner**, `shared/outcome-card.ts`'s
> tone glyphs, and — already covered — `requests-tab`'s green medallion.

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
| Solid fills under fixed white ink: `bg-[#0a6e85]` ×4, `bg-[#0a5f74]` ×3, `bg-[#a3160e]` ×2 | 9 | `--riv-pop-accent`, `--riv-cta-grad` (end stop), `--riv-error-ink` | Three coincidences, one form. An **ink** token and a **popover accent** used as fills, and a gradient stop that is not a fill token — and all three *theme*, while the white ink over them cannot | **done — #854, PR #860** (`--riv-solid-fill-*`), then **merged to one teal — #861, PR #862**: `-action` and `-brand` had no role between them, so the family is `#0a6e85` + `#a3160e` and the three `#0a5f74` fills were repainted. **`#0a5f74`'s full split, settled by #858:** 3 fills (this row) + 4 inks, of which three are now `--riv-medallion-positive-ink`, `--riv-amenity-water-ink` and `--riv-step-active-ink`, and the fourth is `booking-dialog:79`'s gradient stop, which duplicates `--riv-cta-grad` and is that token's question |
| `#8a5410` warn ink, `#8a3a2a`, `#0a5e7a`, `#334a52`, … | ~20 | — | No token at all; these are genuine new-token candidates once their role is named | open |
| Plain `text-[#a3372a]` refund-red inks in `operator/` (`payouts-tab.ts` + `.html`, `daily-view-tab.html`) | 3 | `--riv-solid-btn-danger-ink` | **Migrated onto its own token, `--riv-console-negative-ink`, not the coincidental one.** That token is the outline **button**'s ink, pinned to the button's own non-theming fill (#851); these three are console inks on card glass — different role, different surface, so the same fork #848 settled, whose mechanical answer is the precedent rather than a re-derivation. **Family:** a `--riv-console-*-ink` pair with the accent ink — same host, surface and theme-invariance ground — but in **naming only**: separate declarations (each declared once, which is the whole guard) and separate guard specs, because the two distinctness arguments share nothing (`#0a6e85` has three roles; this one is separated from a button ink and from #852's tints of its own value). **Name:** `negative`, not `danger` — `danger` is that button token's own word and `--riv-danger-*`/`--riv-error-ink` are the tourist alert families, so `danger` would leave the two confusable roles one hyphen apart; `negative` names what the three sites share, a negative outcome, and reads as one axis beside the accent pole at `payouts-tab.ts:135`. The chip tint (5.05:1) is the lowest pair and was measured, not assumed. Found by #848's generalization sweep, which enumerated the plain ink form by mechanism; the `/opacity` tints (#852) and the button ink (#851) already had rows, the ink form had none. **Corrected by #858:** `failure-panel` and `booking-pay` left the `OUT_OF_FAMILY` guard for `--riv-medallion-negative-ink` — their `#a3372a` is a decorative medallion ink, a fourth role — so `payouts-tab.html`'s `/opacity` tints (#852's) are the array's last entry | **done — #864, PR #866** |

### Class S — per-state palettes and one-offs: exempt for now

The tail. A value inside a composite arbitrary variant expression (`[&.premium]:bg-[#…]`)
is **exemption class 2**, and several have specs pinning the class→colour mapping. Tokenising
a *state palette* is a different question from tokenising an ink: it wants one token per
**state**, named for the state — which is a palette design pass, not a migration.

| Component | distinct values | Note |
|---|---:|---|
| `shared/status-chip.ts` | 17 | Nine per-state fill/border/ink triples |
| `booking/booking-view.ts` | 12 | Per-status panel palettes |
| ~~`shared/amenity-chip.ts`~~ | ~~5~~ | **Retired — this row was wrong.** A two-variant tag is class F's shape, not a per-state palette; tokenised as `--riv-amenity-{tag,water}-*` by **#858, PR #867** |
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

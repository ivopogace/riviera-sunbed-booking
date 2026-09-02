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
ink, PR #866), **#858** (the three fixed-fill state skins, PR #867), **#869** (`outcome-card`'s two tone glyphs onto the medallion skin, PR #871), **#870** (the beach-map zoom toggle's fixed-pair-over-a-themed-host, PR #873), **#868** (the amber notice banner's theme-invariant pair, PR #874), **#853** (the CTA hairline's own border token, PR #875), **#852** (all of class **O** — the `/opacity`-modifier positions — settled on rule B and closed, PR #878), **#879** (class **O**'s values: the multiple-of-five alpha ladder, one `--riv-walkin-hatch`, and the three amber families merged into `--riv-warn-{edge,fill,ink}`, PR #880), **#881** (the console confirm buttons' `#9a6410` onto a fourth `--riv-solid-fill-*` member, `-warn`, PR #883), **#882** (the three inline suns onto one `--riv-sun-grad`, and the card sun's compositing defect with them, PR #885), **#849** (class **T-3** re-cut: its population is class F and class R, and the class-T family is empty — PR #886), **#887** (that re-cut's own class-**R** residue: the console sign-out button's hover fill, the tree's last `hover:bg-[#hex]` literal, PR #889), **#888** (the availability calendar's popover verdict — *adopt*: the pinned class-T-3 calendar ramp retires into `--riv-pop-*`, and the class-**S** day-cell palette becomes eight themed opaque tokens, PR #896).

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
| ~~`#0a2a33` (`text-`)~~ + ~~`rgba(12,42,51,·)` inks/borders~~ | ~~14~~ | ~~`--riv-ink` / `--riv-card-ink` / `--riv-pop-ink`, `--riv-ink-faint`, `--riv-card-ink-soft`, `--riv-chip-border`, `--riv-pop-divider`~~ | **Retired — the class-T reading was wrong, and #849 is where it was tested rather than assumed.** Both rows moved to classes F and R below; the note under this table is the finding | **done — #849, PR #886** |
| `bg-[#9a6410]` — the console's close-sales and weather-refund confirm buttons (`daily-view-tab.html`, `payouts-tab.html`) | 2 | `--riv-solid-fill-warn` (**new**, joins the `--riv-solid-fill-*` family, #854) | **migrate** — left literal by #879's own non-goals (that slice merged the amber tint/fill/ink family only, not this button fill); closed once `shared/confirm-panel` gained a `warn` tone for both surfaces to adopt | **done — #881, PR #883** |

> **T-3's finding, and it is the one this file exists to make possible (#849).** The ticket asked
> which of `--riv-ink`, `--riv-card-ink` and `--riv-pop-ink` each of fourteen sites wanted, since
> all three carry `#0a2a33`. Both halves of that question were wrong.
>
> **The population was 8, not 14.** #870 (PR #873) had already consumed six of them with the
> beach-map zoom toggle — including *every* `rgba(12,42,51,0.66)` position in the tree, so that
> sub-family is gone rather than migrated. A ledger row is a snapshot of a moving tree; re-running
> the enumeration is step 0 of any slice cut from this file, not a formality.
>
> **And none of the 8 was class T.** Class T's definition requires "a surface where the token's
> per-theme resolution is correct". Every surviving site fails exactly that clause: four sit on the
> availability calendar's own `rgba(255,255,255,0.97)` `<dialog>` fill or on its four **opaque** day
> tints, one on `booking-view`'s six fixed banner fills, and the three operator borders coincide
> with tokens whose *role* is different. The three candidates agree in porcelain and diverge to
> `#ffffff` / `#f2f7fa` in dark — which is precisely why the ticket read them as interchangeable,
> and why following it would have shipped the light-on-light drift class F exists to prevent, on a
> branch no porcelain screenshot could show. `--riv-card-ink`'s dark value on the neutral banner
> measures **under 1.5:1**: not merely sub-AA, near-invisible.
>
> **The generalizable lesson, since this is now the second time the file has recorded it** (#835's
> `#0a4f5e` was the first): *a value equalling a token is not evidence of anything until the
> surface is named.* Class T's own row order encodes that — value, then role, then surface — and
> T-3 is the case where a slice would have got the first two right and shipped a bug anyway. The
> refusal is now a **test**, not a claim: `shared/fixed-ink-tokens.contrast.spec.ts` measures both
> candidates on every one of these surfaces and asserts they fail, and it also asserts the three
> candidate tokens end the slice byte-identical — without that, "we chose our own tokens" and "we
> quietly widened `--riv-card-ink`" look the same in a diff.
>
> **Two scope movements, and they were forced by two different rules — not one.** The calendar's
> two disabled inks and its hover wash came in because #852's third boundary check forbids leaving a
> named utility beside a raw literal of its own family in one class expression:
> `text-riv-calendar-ink … aria-disabled:text-[rgba(12,42,51,0.4)]` is exactly that artifact. The
> weekday-header `0.72` is **not** that case and should not be filed under it — its `<th>` carries no
> other member of the family, so nothing in its expression triggers the check. What forced it is the
> spec: `availability-calendar.contrast.spec.ts` already modelled `.72` and `.78` as one `CHROME_INKS`
> set, and splitting a set across a token and a literal breaks the shape the spec reads it through.
> And `booking-view`'s `#334a52` body ink came in with the strong ink it shares a class string with
> (maintainer, 2026-09-02). The per-banner **eyebrow** inks did *not*: six values across
> six states is class S's per-state palette, they live in their own constants, and a test now asserts
> they stay literal so the omission reads as a decision.
>
> **One deliberate repaint, stated rather than buried.** The calendar's two disabled inks were
> `0.35` (nav arrow) and `0.4` (day cell), 0.05 apart for no recorded reason — the drift #879's
> ladder exists to collapse. They merge at `0.4`, the higher-contrast of the two, so the one site
> that moves moves the safe way. Neither cleared 3:1 before and the merged token does not either;
> it is not required to, because every site wearing it is `aria-disabled` and WCAG 2.2 SC 1.4.3
> exempts inactive components outright. That ground is the criterion's own **incidental** clause and
> deliberately **not** `non-text-contrast.md` rule 2 — that rule is about a *control's chrome* being
> decorative, this is text, and that file warns against blurring the two. The number was never
> asserted before this slice; it is now pinned in both directions.

### Class F — fixed-fill pair: an ink over a surface that does not theme

The #835 precedent, and the failure mode it exists to prevent: a **themed** ink over a
**fixed** fill drifts between themes (`booking-view.contrast.spec.ts:90` carries the rule).
These families must move **as a pair**, onto tokens declared **once** with no dark override
— exactly as `--riv-solid-btn-ink` is.

| Family | n | Verdict | Status |
|---|---:|---|---|
| Form-error skin: `bg-[#f6e8e7]` + `text-[#a3160e]` (`booking-dialog:311`, `booking-pay:255`, `my-bookings:290`) | 6 | **new theme-invariant token pair.** The themed `--riv-error-ink` is *wrong* here — it resolves `#ffa9a1` in dark, over a fill that stays `#f6e8e7`: light on light | **done — #850, PR #857** |
| Fixed-fill **state skins** on themeable hosts: the outcome medallion, the amenity chip, the dialog step badge | 15 | **Three families, cut by FORM, with the per-state class ternary as the atomic unit.** The how-many-pairs answer, and the reasoning, are in the note below this table | **done — #858, PR #867** (`--riv-medallion-*`, `--riv-amenity-*`, `--riv-step-*`). n corrected 6 → 15 across 8 sites |
| Amber **notice banner**: `bg-[#fcf0d9]` + `text-[#8a5410]` (`withheld-email-notice:29`, `privacy-policy.html`, `terms-of-service.html`) | 6 | **the same pair as the medallion's waiting state, on a different FORM** — a rectangular block with *accessible text*, so unlike the medallion it genuinely owes AA (5.54:1 today). Surfaced by #858's out-of-family sweep, which had to name these sites to prove it did not over-reach onto them. Wants its own theme-invariant pair; do **not** reuse `--riv-medallion-waiting-*`, whose whole population is decorative | **done — #868, PR #874** (`--riv-notice-banner-*`), then **merged into `--riv-warn-{edge,fill,ink}` — #879, PR #880**: the same amber advisory treatment as class O's two confirm-panel families, so all three collapsed. Still NOT `--riv-medallion-waiting-*`, which keeps `#fcf0d9`/`#8a5410` — that remains a different FORM, and merging on the value would be the class-R confusion this file exists to name |
| `shared/outcome-card.ts`'s two tone glyphs | 2 | **the medallion FORM again — and the intake grill inverted the question.** Answer: converge. See the note below the table; n corrected 4 → 2 (the border and inset shadow counted here are class R's #853, not this family's) | **done — #869, PR #871** |
| Beach-map **zoom toggle**: `bg-[rgba(14,122,137,0.12)]`/`bg-white/70` + `border-[#0e7a89]`/`border-[rgba(12,42,51,0.14)]` + `text-[#0a2a33]`/`text-[rgba(12,42,51,0.66)]` (`shared/beach-map-canvas.html:20,35`) | 2 | **not this table's usual shape — a fixed PAIR (ink and fill both pinned) over a host that themes, not a themed ink over a fixed fill.** Found by #869's own generalization sweep enumerating the mechanism rather than the medallion form (see the note below the table). The wash it sits on already carries a per-theme pair for its rail/chip siblings (`--riv-map-rail-*`, `--riv-map-chip-*`), so the fix follows that precedent rather than the theme-invariant one: **new per-theme token pairs**, `--riv-map-zoom-{selected,idle}-{fill,border,ink}`, declared once per theme like the wash itself. Measured (worst wash stop): selected ink 11.18→1.16:1 dark before, 14.53:1 light / 5.14:1 dark after; idle ink 4.88→3.77:1 dark before, 8.45:1 light / 6.69:1 dark after; both borders newly proven at 3:1 (WCAG 1.4.11), not carried across as an accepted miss | **done — #870, PR #873** |
| **Availability-calendar ink ramp**: `#0a2a33` ×2, `rgba(12,42,51,·)` at `.78` ×2, `.72`, `.4`, `.35`, `.07` ×2, over its own `rgba(255,255,255,0.97)` `<dialog>` fill (`availability-calendar.html`) | 10 | **new theme-invariant family**, `--riv-calendar-{glass,ink,ink-soft,ink-faint,ink-disabled,hover}`. Arrived here from class T — see the note above the table. The fill is tokenised too, because a family whose anchor stays a literal is a claim nobody can guard; `--riv-calendar-ink` serves **two** surfaces (the glass and the four opaque day tints), so `testing/calendar-tints.ts` reads it from the one mirror rather than restating it (#835's R-5) | **done — #849, PR #886.** n corrected 5 → 10; the extra five are the take-the-whole-expression positions the note explains |
| **booking-view banner prose**: `text-[#334a52]` + `[&_strong]:text-[#0a2a33]` (`booking-view.ts:89`) and `confirmQOnBanner` (`:99`), over six fixed banner fills | 3 | **new theme-invariant pair**, `--riv-banner-{body,strong}-ink`. The sharpest case for T-3's refusal: `--riv-card-ink`'s dark `#f2f7fa` on the neutral banner's `#f0f2f3` is under 1.5:1. The per-banner **eyebrow** inks stay out — class S's per-state palette, and asserted as staying out | **done — #849, PR #886.** n corrected 1 → 3: `#334a52` was uncounted (it shares the strong ink's class string) and appears at `:99` too |
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
> unchanged, and decorative under `non-text-contrast.md` rule 2 rather than under the
> since-closed #834 they originally cited: 1.24 / 1.15 / 1.17.
>
> **F-5's answer (#869), and why it is not the answer the ticket expected.** The ticket asked
> whether the three landed-state surfaces should look alike, framing `outcome-card` as a third way
> that broke ranks. The intake grill checked that framing against `docs/design/` and found it
> **inverted**: the artboards drew *every* medallion as a translucent brand tint —
> `rgba(43,184,212,0.18)`/`#0a6e85` positive (`riviera-sign-in.dc.html:128,138`,
> `…v3.dc.html:539`), `rgba(240,170,46,0.18–0.2)`/`#a86a12` waiting (`:148`, `:644,679`) — and
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

### Class O — `/opacity` modifier: **settled on rule B, normalised by the ladder, and done**

**44 positions carried Tailwind's `/opacity` modifier** (`bg-[#2bb8d4]/20`). This class was held
back on the premise that tokenising one *changes the computed value*, so none was a candidate for
a mechanical pass and every family owed a before/after diff. **That premise was wrong**, and
correcting it is what let the class close in one slice.

Tailwind compiles `bg-[#2bb8d4]/20` to `color-mix(in oklab, #2bb8d4 20%, transparent)` — the
**literal form already produces a `color-mix()`** — and compiles `bg-riv-select-tint/20` to the same
expression with `var(--riv-select-tint)` in the colour slot. Measured in Chromium across the 29
(colour × alpha) pairs this class actually contained, over five host colours: `color-mix` and a
pre-composed `rgba()` composite **byte-identically, 145/145**. So neither of the options this
class was stuck between moved a pixel, and the choice was never about visual risk.

**The rule, for any future `/opacity` position: the modifier stays at the call site, and the
literal inside it becomes a token.** One token per base colour, no alpha baked in.

**And the alpha it carries is a multiple of five** — rule B's companion, added by **#879** (option
C, PR #880). B preserved every per-site alpha, which is the right default for a migration and the
wrong end state for a palette; the ladder is what collapses the drift B preserved. It is
deliberately a constraint on the **alphas**, not a new token shape: pre-composing one token per
(colour × alpha) pair would flip every `toHaveCSS` on these sites from `oklab()` to `rgba()` and
move each alpha away from the comment explaining it — the same two objections that chose B over A.

Five, because all but **eleven** class-O alphas already sat on it — nine the ladder sweep named on
its first red, plus the two below that only the generalization audit could reach. So the whole
normalisation moved eleven positions by at most 3 points, and — the part that made it cheap — it cost `beach-cell`'s
aisle boundary nothing: that `/55` is load-bearing (0.55 and not 0.35, for a stated 1.4.11 reason)
and 55 is already on the ladder, so the rule never had to carve an exemption for the one value that
could not move. It is named and pinned anyway, in `beach-cell.spec.ts`, because the ladder is a rule
about alphas and that alpha is a rule about contrast; a future re-cut that did not know the second
rule existed would otherwise be free to round it.

| Site | Position | Before | After |
|---|---|---:|---:|
| `payout-statement` | table header row + empty-state fill | `/4` ×2 | `/5` |
| `payout-statement` | table row separator | `/7` | `/10` |
| `payout-statement` | table outer border | `/12` | `/15` |
| `payout-statement` | close chip border + total-row rule | `/14` ×2 | `/15` |
| `payout-statement` | total-row fill (`--riv-select-tint`) | `/6` | `/5` |
| `set-editor` | armed-move panel fill (`--riv-select-tint`) | `/12` | `/10` |
| `requests-tab` | accepted-medallion fill (`--riv-positive-tint`) | `/12` | `/10` |
| `payouts-tab` | reason-chip border + fill (`--riv-console-negative-ink`) | `/28`, `/12` | `/30`, `/10` |
| **`beach-cell`** | **aisle boundary — load-bearing, 1.4.11** | **`/55`** | **`/55`, exempt** |

> **The last row of that table is the one worth reading twice.** The reason-chip pair was *not* in
> the plan's enumeration, and no reading of this section's family rows would have surfaced it: the
> chip **reuses** `--riv-console-negative-ink` (the row three above says so), a token the class-O
> array does not hold, so a sweep scoped to that array reported the ladder complete while walking
> straight past two off-ladder positions. Found by enumerating the **form** — any `--riv-*` token
> wearing an `/opacity` modifier — which is what class O is actually defined by. The guard is now
> written that way, so the next reuse is caught by construction.

**Two more collapses came with the ladder, both of them things the code claimed and did not do.**

*The walk-in hatch was a three-way.* `beach-cell` painted 30%/12%, `layout-editor`'s tool swatch
35%/12% **under a comment calling it a mirror of the cell**, and `daily-view-tab`'s tile and legend
28%/10%. Rule B had no reason to notice — each site was internally consistent, and the drift only
reads as drift once the three sit in one place. All three are now one `--riv-walkin-hatch` image
token at 30%/10%, the `--riv-premium-grad` precedent: one declaration is the only thing that keeps a
mirror mirroring. #852 concluded the walk-in sibling could not be an image token because "those
three gradients differ by alpha per site" — which was true, and was the bug.

*The ambers were four tokens and three roles.* `--riv-warn-edge`/`--riv-warn-tint` painted the
console's two confirm panels; `--riv-confirm-warn-*` painted `shared/confirm-panel`. Those two are
**one role in two paints** — the console panels are hand-rolled twins of that component, same job,
different markup — which is what makes the merge a role match rather than a value coincidence.
`--riv-notice-banner-*` (class F-4, #868) joined them, because an amber advisory is one treatment
whichever surface carries it. The result is `--riv-warn-{edge,fill,ink}` = `#e0a03a`/`#fff4e0`/`#7a4a08`
— confirm-panel's values, chosen because they are the **higher-contrast** pair (6.86:1 against the
notice banner's 5.54:1), so all six surfaces moved the safe way and confirm-panel itself did not move
at all. **`--riv-premium-edge` stayed out**: a beach-map *tier identity* over a gold gradient is not
a warning, and role beats value — the fork #848, #858 and #864 each resolved the same way.

> **The merged family's theme-invariance argument changed hands, which is the durable lesson.** As a
> class-O token it rested on "every consumer is a child of `operator-console`, whose host pins
> porcelain, so a dark branch is unreachable". Absorbing the notice banner made that ground **false**
> — the legal pages and `withheld-email-notice` are tourist surfaces that render under all three
> document themes. What holds instead is #868's, and it is the stronger claim: a **fixed fill pins
> every ink on it**, whichever theme the page is in. When a token family grows, re-check that its
> invariance argument still covers the new members; a single declaration that keeps its old reason is
> a claim nobody has re-proved.

**One exemption this slice created, by moving a value onto it.** `daily-view-tab`'s close-sales
trigger button carries `--riv-warn-edge/50` on its own `white/60` fill: 1.65:1 before the merge,
1.48:1 after. Both sub-3:1, and the position carried no entry anywhere — so the ladder did not create
this exemption, it **found one nobody had written down**. It is now a recorded family under
`non-text-contrast.md` **rule 2**, with all three conditions demonstrated in an assertion.

Why B rather than pre-composing an `rgba()` token per (colour × alpha) pair, the form
`--riv-danger-*` and `--riv-accent-*` set the precedent for:

- **It preserves the computed-style string, not just the paint.** Pre-composing flips every
  `toHaveCSS` on these sites from `oklab(…)` to `rgba(…)`; B leaves the assertions untouched.
- **The alpha stays beside the comment that explains it.** `beach-cell`'s aisle boundary is
  `/55` and not `/35` for a stated 1.4.11 reason; pre-composing moves the number away from its why.
- **It does not multiply tokens by drift.** `#0c2a33` alone carries ten distinct alphas across
  seventeen sites, so A would have registered ten tokens for one colour.
- **It expresses a reuse A could not.** `payouts-tab`'s reason chip takes
  `--riv-console-negative-ink` — the ink token already on that element — for its border and fill,
  because there the value coincidence *is* a role match.

**The one behavioural difference, stated rather than left to be discovered.** For a `var()`-valued
colour Tailwind emits an extra fallback declaration *outside* its
`@supports (color: color-mix(in lab, red, red))` guard, and that fallback is the **fully opaque**
colour (an unresolvable `var()` inside `color-mix()` collapses to the base colour — traced in
`tailwindcss/dist/lib.js`). The literal form emits no fallback at all. It paints only where
`color-mix()` is unsupported, which is below Tailwind v4's own documented floor — its
compatibility page names **Chrome 111 / Safari 16.4 / Firefox 128** — so every other v4 utility is
equally undefined there. Worth knowing before writing `bg-riv-x/α` on a surface where an opaque
fallback would be harmful.

**What the documentation says: nothing.** Tailwind's *Colors* page states only that the modifier
"sets the alpha channel of the color" and never says what it compiles to; its *Referencing other
variables* section documents `@theme inline` with per-scope `:root` overrides — this repo's exact
pattern — with no caveat about combining the two. Angular's v22 docs return zero results for
colour-token and contrast queries, the same silence `non-text-contrast.md` records. The compiler
settled this, not the docs.

| Family | n | Token(s) | Status |
|---|---:|---|---|
| `#0c2a33/·` in `operator/` | 17 | `--riv-console-tint` | **done — #852, PR #878** |
| `#2bb8d4/·` + `#0e8aa8/·` (map/editor selection chrome) | 8 | `--riv-select-tint`, `--riv-select-edge` | **done — #852, PR #878** |
| `#a3160e/·` (borders `/25 /30 /40 /50`, fill `/10`) | 7 | `--riv-alert-tint` | **done — #852, PR #878** |
| `#d9861a/·`, `#f0aa2e/·`, `#0e6e46/·` | 7 | `--riv-warn-edge`, ~~`--riv-warn-tint`~~, `--riv-positive-tint` | **done — #852, PR #878**; the two ambers merged into `--riv-warn-{edge,fill,ink}` — **#879, PR #880** |
| `#a3372a/·` (`payouts-tab`'s reason chip) | 2 | *reuses* `--riv-console-negative-ink` | **done — #852, PR #878** |
| `#061e28/45` (`payout-statement`'s backdrop) | 1 | `--riv-console-scrim` | **done — #852, PR #878** |
| `#b47814/40` (`beach-cell`'s premium border) | 1 | `--riv-premium-edge` | **done — #852, PR #878** |
| `#e0a03a/60` (`confirm-panel`'s edge) | 1 | ~~`--riv-confirm-warn-edge`~~ → `--riv-warn-edge` | **done — #852, PR #878**; merged — **#879, PR #880** |

> **The last three rows did not exist before #852.** This section's table enumerated **41** of its
> own 44 positions — `#061e28/45`, `#b47814/40` and `#e0a03a/60` appeared in no family row, so a
> reader working the table to completion would have left three behind. Found by running the
> population command with the `]/α` suffix rather than by reading the rows.

**Three skins came with the migration**, because #858's take-the-ternary-whole rule forbids leaving
a named utility beside a literal in one expression: `beach-cell`'s `CELL_CLASS` (its walk-in
gradient painted the same base colour raw, its premium gradient became the shared
`--riv-premium-grad` image token), the selected/unselected ternaries in `set-editor` and
`layout-editor` (whose selected branch paired a class-O fill with a *plain* `#0e8aa8` border), and
`shared/confirm-panel`'s warning surface (whose class-O edge shares a host string with a class-S
fill and ink). Generalizing that rule by **mechanism** — class expressions naming a class-O token
*and* a raw literal of its own value — also turned up `daily-view-tab`'s BOOKED_ONLINE tile and the
two swatches mirroring it, which no reading of the four family rows would have surfaced. It is now
a standing test rather than a habit.

**Class O is closed, both halves.** #852 settled the form (rule B) and #879 settled the values (the
ladder + the two collapses above). What class O now leaves behind is a **boundary rather than a
backlog**, and it is four standing checks, not one: no `/opacity` colour literal anywhere in
`frontend/src`; no `/opacity` alpha off the multiple-of-five ladder, on any `--riv-*` token; no class
expression naming a class-O token beside a raw literal of its own value; and no positive
"still painted here" list allowed to be empty. Each of the last three is a generalization of a
mistake one of the two slices made and caught.

### Class R — role mismatch: the value matches a token whose *role* is different

Substituting here would be a **role confusion** — the value happens to coincide, the meaning
does not. Each needs its own token, not the coincidental one.

| Family | n | Coincides with | Why not that token | Status |
|---|---:|---|---|---|
| `rgba(255,255,255,0.4)` in `auth/`, `booking/`, `shared/` — **16 `border-` + 1 `bg-`** | 17 | `--riv-inset-fill` | That is a **fill** token (dark theme: `rgba(255,255,255,0.08)`). A border wants a border token; none of this value existed | **done — #853, PR #875** (`--riv-cta-border`). **Split corrected: 16/1, not the 15/2 this row and the issue both claimed** — re-enumerated with this file's own population command. The 16 borders are one family by FORM: a white hairline bevel on a **fixed** teal action surface (`--riv-cta-grad`, declared once and inherited by all three themes, plus `booking-dialog`'s `#31798a` close button). So **theme-invariant**, and deliberately NOT modelled on `--riv-card-border` as #853 suggested — that token themes because the card glass *under* it themes; measured, its dark value over these fills is 1.35–1.46:1, a hairline that all but vanishes. Non-text chrome (WCAG 1.4.11) at 2.08–2.48:1 over its own fills, measured rather than waved off, the `--riv-solid-btn-border` precedent. **Settled by #876:** the dark theme's 2.23–3.16:1 is a fill-vs-card-glass pairing, and the hairline sits between those two — measured against the colour it is actually adjacent to, this button's boundary clears 3:1 in every theme (the fill carries it in the light themes at 3.80–7.24:1, the hairline in dark at 5.52–6.77:1). `docs/design/non-text-contrast.md` rule 1 owns that reading; no palette change was needed. The lone `bg-` site (`booking-confirmation`'s summary `<dl>`) was judged individually and **is** `--riv-inset-fill`: it repaired a live dark-theme AA failure the card's contrast spec could not see, because that spec composites the list's inks on the card glass alone and never modelled the extra fill layer (2.62–3.29:1 → 7.71–8.60:1) |
| Solid fills under fixed white ink: `bg-[#0a6e85]` ×4, `bg-[#0a5f74]` ×3, `bg-[#a3160e]` ×2 | 9 | `--riv-pop-accent`, `--riv-cta-grad` (end stop), `--riv-error-ink` | Three coincidences, one form. An **ink** token and a **popover accent** used as fills, and a gradient stop that is not a fill token — and all three *theme*, while the white ink over them cannot | **done — #854, PR #860** (`--riv-solid-fill-*`), then **merged to one teal — #861, PR #862**: `-action` and `-brand` had no role between them, so the family is `#0a6e85` + `#a3160e` and the three `#0a5f74` fills were repainted. **`#0a5f74`'s full split, settled by #858:** 3 fills (this row) + 4 inks, of which three are now `--riv-medallion-positive-ink`, `--riv-amenity-water-ink` and `--riv-step-active-ink`, and the fourth is `booking-dialog:79`'s gradient stop, which duplicates `--riv-cta-grad` and is that token's question |
| The white **inset-highlight** ramp inside composite shadows (`shadow-[…inset_0_1px_0_rgba(255,255,255,α)]`) | 48 | `--riv-inset-fill` (the α = 0.4 member only) | Split out of the row above by **#853**, which deliberately left it. Same coincidence, third role: an inner highlight LINE, not a border and not a fill — and it is one member of an eight-alpha ramp (0.25 / 0.4 / 0.5 / 0.6 / 0.7 / 0.8 / 0.85 / 0.9), so tokenising the one that happens to match would leave a named var beside seven literals in the same idiom. Not in this file's population command either (it requires `#`/`rgba(` immediately after `[`). Wants a **ramp** named by depth, which is a palette pass, not a migration | open |
| White **0.6** borders (`outcome-card`, `request-confirmation`, `booking-pay`, `booking-confirmation` ×2) | 5 | `--riv-card-border` (light value) | Recorded by **#853**, whose neighbour it is; `testing/glass-tokens.ts` pointed these at that issue, which was never their family. Role matches this time — a border pointed at a border token — so the question is the **surface**, and it splits: four sit on fixed medallion/badge fills (a themed border would drift, the #853 answer) and one is the confirmation `<dl>`'s edge on the now-themed inset fill (where `--riv-card-border` may be exactly right) | open |
| **The operator console's two white-surface hairlines**: `rgba(12,42,51,0.1)` ×2 (`operator-console.html:4,62` — the sign-in card and the active tab pill) and `rgba(12,42,51,0.14)` (`operator-actions.ts:54` — the sign-out button) | 3 | `--riv-pop-divider`, `--riv-chip-border` | **Migrated onto their own tokens, `--riv-console-{card,btn}-border`, not the coincidental ones** — the #848/#864 fork a third time, arriving here from class T. `--riv-pop-divider`'s entire population is ONE rule inside the account popover (`app.html:296`); `--riv-chip-border` is the tourist shell chip's edge over the themed `--riv-chip-bg` (`app.html:161,219`, `home.html:5`). Neither was a *rendering* bug — the console pins porcelain, so both resolved correctly — and that is exactly why the objection has to be stated mechanically: `@theme inline` resolves `var(--riv-*)` at the point of use, so retuning the popover or the tourist chip would have moved console chrome belonging to neither. **Two tokens rather than one, and the 0.04 between them is not the reason — FORM is:** `-card-border` bounds a surface, `-btn-border` is a control's own affordance boundary, the distinction `--riv-wash-hover-border` already draws. Merging would have meant repainting one for a similarity that is only a value. Declared once each (every consumer is under a porcelain-pinned host, so a dark branch is unreachable), and a guard asserts the two coincidental tokens stay themed and separate — collapsing back onto them is what this re-cut refused | **done — #849, PR #886** |
| `#8a5410` warn ink, `#8a3a2a`, `#0a5e7a`, ~~`#334a52`~~, … | ~20 | — | No token at all; these are genuine new-token candidates once their role is named. **`#334a52` left this row with #849** — it shares `bannerBody`'s class string with the strong ink, so it moved as a pair rather than waiting for its own slice | open |
| Plain `text-[#a3372a]` refund-red inks in `operator/` (`payouts-tab.ts` + `.html`, `daily-view-tab.html`) | 3 | `--riv-solid-btn-danger-ink` | **Migrated onto its own token, `--riv-console-negative-ink`, not the coincidental one.** That token is the outline **button**'s ink, pinned to the button's own non-theming fill (#851); these three are console inks on card glass — different role, different surface, so the same fork #848 settled, whose mechanical answer is the precedent rather than a re-derivation. **Family:** a `--riv-console-*-ink` pair with the accent ink — same host, surface and theme-invariance ground — but in **naming only**: separate declarations (each declared once, which is the whole guard) and separate guard specs, because the two distinctness arguments share nothing (`#0a6e85` has three roles; this one is separated from a button ink and from #852's tints of its own value). **Name:** `negative`, not `danger` — `danger` is that button token's own word and `--riv-danger-*`/`--riv-error-ink` are the tourist alert families, so `danger` would leave the two confusable roles one hyphen apart; `negative` names what the three sites share, a negative outcome, and reads as one axis beside the accent pole at `payouts-tab.ts:135`. The chip tint (5.05:1) is the lowest pair and was measured, not assumed. Found by #848's generalization sweep, which enumerated the plain ink form by mechanism; the `/opacity` tints (#852) and the button ink (#851) already had rows, the ink form had none. **Corrected by #858:** `failure-panel` and `booking-pay` left the `OUT_OF_FAMILY` guard for `--riv-medallion-negative-ink` — their `#a3372a` is a decorative medallion ink, a fourth role — so `payouts-tab.html`'s `/opacity` tints are the array's last entry. **Resolved by #852:** those tints turned out to belong to this very token — same element, same meaning — so they were migrated ONTO it rather than to one of their own, and the fourth role never materialised as a fifth token. The guard's last entry stays, rewritten to the token form rather than deleted: it records a paint #851 must not have taken, not the notation that paint wears | **done — #864, PR #866** |

> **Two things #849's own generalization sweep found and deliberately did not take**, recorded so
> the next sweep does not read their absence as an oversight:
>
> - **`operator-actions.ts:54`'s `bg-[#eef1f2]` hover fill**, sitting in the same class string as the
>   sign-out button's new border token. Not a violation of #852's beside-a-literal check (different
>   value, different role), and not in #849's population, which is the `#0a2a33` / `rgba(12,42,51,·)`
>   values. It is a genuine "no token at all" candidate with no row anywhere — it has one now.
>   **done — #887, PR #889** (`--riv-console-btn-hover`), and the verdict is a *refusal* rather than
>   a placement: the ticket asked whether this skin is `--riv-solid-btn-{fill,hover}` in different
>   markup, and it is not. Adopting that pair repaints, because its resting fill is `#f4f6f7` where
>   this button's is `#ffffff` — two positions moved to migrate one, and #849's whole claim is that
>   no pixel moves. FORM separates them anyway, the same argument that kept `--riv-console-btn-border`
>   off `--riv-chip-border`: a grey chip with a **white** `0.7` bevel on themeable card glass is the
>   inverse construction of a white pill with a **dark** hairline on porcelain header glass, and
>   their theme-invariance rests on different grounds (a fixed fill that would drift a themed ink,
>   versus a porcelain-pinned host with no reachable dark branch) — #864's bar for sharing a name.
>   So it joins the `--riv-console-btn-*` skin as its third member. The **resting** fill stays
>   `bg-white` and gained no token, #849's own answer on this surface, asserted so the omission
>   reads as a decision. Its 1.4.11 ground, which no slice had ever recorded, is now a row in
>   `non-text-contrast.md` — the first there that is a **state** rather than a boundary.
> - **Whether the calendar popover should adopt `--riv-pop-surface`/`--riv-pop-ink` instead of being
>   pinned light forever.** The app already has a popover treatment that themes correctly
>   (`rgba(255,255,255,0.92)` → `rgba(16,26,46,0.96)` with light inks), and the calendar's `<dialog>`
>   is arguably the same thing. Found by enumerating near-opaque white fills rather than by reading
>   the family rows. Not folded in because it is a **repaint** — it would turn the calendar dark in
>   the dark theme — and #849 is a migration whose entire claim is that no pixel moves.
>   **done — #888, PR #896, and the verdict is *adopt*** (maintainer, 2026-09-02): the calendar is a
>   `--riv-pop-*` consumer in every theme; the six `--riv-calendar-{glass,ink,ink-soft,ink-faint,
>   ink-disabled,hover}` tokens this row registered are retired (the popover family gained
>   `--riv-pop-ink-disabled` for the calendar's `aria-disabled` sites); and the coupling the ticket
>   named — the four opaque day tints — is answered by keeping them **opaque and theming them**: one
>   set in the base block, one in the `dark` block, so each contrast proof stays a plain pair and
>   the count merely doubles. The light themes keep every day-cell colour; the light-theme chrome
>   moves by the popover family's own values (glass 0.97 → 0.92, the two soft inks → 0.7, the hover
>   wash → 0.06), enumerated in `docs/plans/calendar-popover-theming.md`'s parity ledger. The
>   whole-tree fact this settled is written down below, under *The overlay surfaces*.

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
| ~~`venue/availability-calendar.html`~~ | ~~5~~ | **done — #888, PR #896.** The month-step glyphs, the bar fill and the bar track onto `--riv-calendar-{accent,bar-fill,bar-track}`; the `<dialog>`'s border and shadow onto `--riv-pop-{border,shadow}` — all themed |
| ~~`venue/day-availability.ts`~~ | ~~3~~ | **done — #888, PR #896.** The first class-S palette actually cut: four opaque per-state fills onto `--riv-calendar-{free,low,full,unknown}-fill`, declared once in the base block and once in the `dark` block (a second opaque set, so each proof stays a plain pair), and the chosen-day ring onto `--riv-calendar-selected-ring` through a `var()` inside the inset shadow. Mirror: `testing/calendar-tints.ts`; proof: `venue/availability-calendar.contrast.spec.ts` |
| ~~`venue/day-availability.ts` — `focus-visible:outline-[#0a3f4e]` ×4~~ | ~~1~~ | **Outside the population command** — its prefix set is `(text\|bg\|border\|fill\|stroke\|shadow)-\[`, so `outline-` was never enumerated; surfaced by [#890](https://github.com/ivopogace/riviera-sunbed-booking/issues/890)'s focus-ring sweep, which left it alone (a colour change is a repaint, not a migration). **done — #888, PR #896**: the ring is `--riv-calendar-accent`, themed with the popover it sits in (`#0a3f4e` light, `#9adde8` dark) — and still deliberately not `--riv-accent-ink`, though that would now clear 3:1 on every fill in both palettes: it coincides with the chosen-day ring's value in both (`#085a6e` light, `#7cd7e8` dark), and a focused chosen cell must not wear one colour twice |
| `shared/confirm-panel.ts` | 3 | Tone palettes |
| others (11 components) | ~14 | |

**One recorded deliberate deviation stays literal, permanently:** `app.html:6`'s sign-out
bar (`#b3261e` on solid white, both themes). The reason is written at `app.ts:59–69` — it is
a safety notice about a session that may still be open on a shared device, so legibility
outranks theme harmony. **Exemption class 1.** Measured 6.5:1, past AA. Do not sweep it.

### The inline image gradients — one declaration, three times running

Not a colour class: these positions are **images**, built inline in a class expression rather than
named by a token. The ledger records them because the same finding has now landed three times, and
the third one arrived with a bug attached.

| Image | Consumers before | Now | Slice |
|---|---:|---|---|
| beach-map premium cell | 2 | `--riv-premium-grad` | #852, PR #878 |
| beach-map walk-in hatch | 3 | `--riv-walkin-hatch` | #879, PR #880 |
| the sun | 3 | `--riv-sun-grad` | **#882** |

**#882 is the one to read, because the issue that opened it named the wrong pair.** It filed two
suns — the app shell's brand mark and the Discover card's empty state — and set the other six
inline gradients aside as per-site. Re-running its own enumeration returned a third the audit had
walked past: `venue-map`'s photo-band empty state. That one shares the *card's* role exactly —
`photos.length === 0`, over `--riv-photo-grad`, under `--riv-photo-scrim`, anchored top-42%
centred — while the brand mark is identity chrome. So the three split **1/2 by role**, not 2 by
value, and the pairing the ticket proposed was not the one the code had.

**The lesson repeats and should stop needing to be re-learnt: enumerate by mechanism, judge by
role.** #879 said the same thing about the hatch. The mechanism here is "an image built inline in a
class expression"; it is what returns the member you had not noticed, because the two you *had*
noticed share a notation and the one you missed does not.

**The merge was not cosmetic at one consumer.** The card sun's stops were translucent, so they
composited against the cyan beneath instead of covering it — rgb(211,221,181) at the centre and
rgb(117,162,126) at the outer stop, green channel above red at both. It rendered as an olive orb,
not a sun. That is precisely the "flat pale-green blob" **#704** diagnosed and fixed — applied to
the map alone, with `venue-map.spec.ts` asserting every-stop-opaque while its sibling consumer
kept the very shape the assertion existed to forbid. **A rule enforced at one of a value's
consumers is not enforced.** The token is where such a rule can be stated once; the assertion has
moved there, and now covers all three.

**Which values won, and why that made the merge cheap.** The map's, because they were the only
ones already tuned against the surface they sit on. A prototype rendered all three under each
candidate (branch `spike/882-sun-merge`): at 32 px the brand mark is indistinguishable between the
paints, on the map's paint the 96 px band is byte-identical, and the card is the only site that
moves — from broken to right. Adopting the *broken* consumer's notation, or splitting the
difference, would have moved two correct sites to fix one.

**`--riv-premium-edge`'s fork did not apply here, and that is worth stating rather than assuming.**
Role beats value settled #848, #858, #864 and #879 the other way — a tier identity is not a
warning — and by that rule the brand mark, being identity chrome, had a claim to stay out. It was
merged anyway, on evidence rather than by exception: the rule exists because a coincidental value
match drags a role somewhere it does not belong, and here the maintainer's call was that one sun is
one thing across the product. The prototype is what made that decidable — the brand mark does not
move, so the merge costs the identity nothing.

**Theme-invariance, and why it is load-bearing rather than incidental.** Every stop is opaque, so
the sun composites against nothing and cannot take a themed backdrop's colour. `--riv-photo-grad`
*does* have a dark override, which means the translucent form was not merely wrong once — it was
wrong differently per theme. Declared once in the base block, no dark override; the single-
declaration guard is the only thing able to see one added later.

Proof: `shared/sun-token.contrast.spec.ts` (one declaration, the adopted values, and the tree-wide
sweep that no source rebuilds a sun inline, with a meta-test so the sweep cannot pass vacuously) +
`e2e/sun-token.e2e.ts` (the three computed `background-image`s in a real render).

**Residue.** The enumeration now returns five inline gradients, none of them a sun: `booking-dialog`,
`booking-view`, `beach-grid-frame`, `beach-map-canvas` and `map-tile`. Each is genuinely per-site,
and the last two already build from `--riv-*` vars. This slice also removes one `rgba(240,170,46,…)`
position from the population — the card sun's outer stop — which is why `fixed-fill-token-skins`'s
out-of-family row for `pages/home/home.html` was retired rather than rewritten: the paint it guarded
is gone, not renamed. (Its inner stop, `rgba(255,236,180,0.95)`, was a different colour family and
carried no row.)

## The overlay surfaces — three families, and the one that was pinned

Written down so the question #849 parked and #888 answered is not rediscovered a third time. The
population is every overlay in `frontend/src/app`, enumerated by the mechanism that makes one (a
`<dialog>`, a `role="dialog"`/`role="menu"` box, an `aria-modal`, or one of the family fills), not
by resemblance — the command is in `docs/plans/calendar-popover-theming.md`'s generalization-audit
log.

| Overlay | Family | Porcelain | Dark |
|---|---|---|---|
| theme picker, account menu, mobile sheet (`app.ts` `POP`) | `--riv-pop-*` | white `0.92`, dark ink | slate `0.96`, light ink |
| **availability calendar `<dialog>`** (`venue/availability-calendar.html`) | `--riv-pop-*` **since #888**; before it, the pinned `--riv-calendar-*` ramp #849 registered | white `0.92`, dark ink, light opaque day tints | slate `0.96`, light ink, **dark opaque day tints** (`--riv-calendar-*`, declared in both blocks) |
| booking dialog, find-a-booking (`booking/`) | `--riv-dialog-glass` | white `0.82` | slate `0.94` |
| payout statement (`operator/payout-statement.ts`) | none — `bg-white` under the console's porcelain-pinned host | white | unreachable (the host pins porcelain) |
| photo lightbox (`shared/photo-lightbox.ts`) | none — a fixed `rgba(4,18,24,0.86)` scrim over a photo | photo-proof dark | photo-proof dark |

So the overlay families were three — two that themed and one pinned light — and are now **two**,
both themed: the calendar was the only surface outside them that a tourist could reach in the dark
theme, and nobody had decided it should be. The 2026-08-25 restructure note's claim in
`2026-07-02-liquid-glass-redesign-note.md` — "the dark theme inverts the whole surface family
(dark cards/dialogs/popovers/fields, light inks)" — is true of the shipped app since #888. The two
out-of-family overlays are so for reasons the tree already records (a porcelain-pinned host; a
photo-proof scrim), not by omission. `riviera` is not a column because it redeclares no overlay
token: its popovers are the base block's white glass by that theme's design.

## How to cut a slice from this ledger

Each family becomes its own issue and its own PR, largest inconsistency first. The pattern
#829 and #835 established, and the proof each slice owes:

0. **Re-run the enumeration before trusting the row's `n`.** A row is a snapshot of a moving
   tree, and a sibling slice may have consumed part of it: #849 opened on a 14-site row whose
   real population was 8, because #870 had taken six — a whole sub-family — since it was
   written. Costs one command; #849 is what it saves.
1. **Name the painted-on surface for every site** before choosing a token. This is the step
   that splits a family; skipping it is how #835's `#0a4f5e` would have gone wrong — and how
   #849 would have shipped white ink on white glass while satisfying its own ticket.
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

Not yet for the population as a whole — #836's step 4, deliberately deferred. A rule is worth
writing when the residue is a **boundary** rather than a backlog. Classes T + F + R are still live
work; class S is a palette design pass of which #888's calendar cut is the first. Revisit once T, F and R are `done` and
the remaining literals are all class S and the one class-1 exemption — at that point the rule is
"a colour literal must sit inside an arbitrary variant expression or carry a recorded deviation",
which is checkable and would hold.

**Class O is already there, and is the worked example of what "a boundary" means.** #852 did not
just migrate its 44 positions; it left a test that fails on **any** `/opacity` colour literal
anywhere in `frontend/src` — including one of a colour no token covers, which is the property that
separates a boundary from a backlog. Two more standing checks came with it, both generalizations of
mistakes the slice made and caught: no class expression may name a class-O token *and* a raw
literal of its own value (a half-migrated per-state branch), and a positive "still painted here"
list may not be empty (an emptied guard passes vacuously). When T, F and R close, this is the shape
the whole rule can take — a `check-*.mjs` in the same family as the other hygiene guards rather
than a new kind of thing.

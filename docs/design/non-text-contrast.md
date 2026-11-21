# Non-text contrast — the project's settled position on sub-3:1 chrome

**Status:** living rule. Adopted by [#876](https://github.com/ivopogace/riviera-sunbed-booking/issues/876)
after the question had been deferred four times to
[#834](https://github.com/ivopogace/riviera-sunbed-booking/issues/834), an issue that was
scoped to the erasure panel and closed as completed on 2026-08-31. This file is the **live
home** those deferrals now point at, and it is maintained: corrected in place when the
position moves.

WCAG SC 1.4.11 (Non-text Contrast, AA; the text is word for word the same in 2.1 and 2.2) asks
that *visual information required to identify user interface components and states* reach 3:1
against **adjacent** colour(s). The Liquid Glass design puts pale fills on pale glass, so the
question "is this boundary a violation or is it decoration?" recurs on nearly every token family.
This file answers it once, so token comments cite a rule instead of re-deferring.

Neither of the project's frameworks has a position to inherit here, which is why the rule is
ours to write: Angular's a11y guide is scoped to ARIA, native-element augmentation and focus
management and returns nothing for colour-contrast queries; Tailwind's colour pages give no
contrast guidance, and its entire accessibility surface is the `forced-color-adjust` utility.
Nor can automation catch it — axe's `color-contrast` rule measures **text** and is disabled
under jsdom (`src/testing/axe.ts`), and `angular.configs.templateAccessibility` has no
contrast rule. That is why this repo hand-writes composited maths in `src/testing/contrast.ts`
and why the judgement has to be written down rather than linted.

---

## Rule 1 — Measure against the colour the boundary is actually adjacent to

> **A component's boundary is whatever layer abuts its host surface — measure that layer, not
> the one behind it.**

Sounds obvious; it is the single most common error in this tree's own history, because a
button on glass has *two* candidate boundaries — its fill and its border — and which one abuts
the card depends on the theme.

**Worked example — the CTA.** #876 reported the primary CTA as failing 1.4.11 in the dark
theme, measuring its `--riv-cta-grad` fill at 2.23–3.16:1 against the card glass. The number
is right and the pairing is not the one this project measures: the white `--riv-cta-border`
hairline sits **between** the fill and the glass, so this file treats the hairline, not the fill,
as what abuts the card (*What the W3C pages say about "adjacent"*, below, says how far the source
takes that). Measured that way, the CTA's
boundary against its host card clears 3:1 in every theme — and the carrier swaps, because the
fill is a fixed mid-teal that the themes move *around* rather than *with*. (In the dark theme the
CTA no longer rests on this reading alone: it is also a rule 2 family, by the owner's decision on
[#1840](https://github.com/ivopogace/riviera-sunbed-booking/issues/1840).)

| Theme | What abuts the card | Clears 3:1 |
|---|---|---|
| porcelain | the fill (the hairline is the lighter half, but the fill is what the eye reads against light glass) | yes |
| riviera | the fill | yes |
| **dark** | **the hairline** — white 0.4 over a mid-teal fill, against a near-black card | yes |

Ratios are deliberately **not** restated here. They live in
`app/shared/cta-border-token.contrast.spec.ts` › "the boundary against the host card clears
3:1 in every theme — the fill carries it in light, the hairline in dark", which is the one
place they can go stale loudly.

**Corollary, worth stating because it closed #876's second option:** on a dark host, a
boundary cannot be raised by *darkening*. The dark theme's lightest card composite is
luminance ≈ 0.015, so 3:1 in the darker direction would need a negative luminance. Only
lightening can reach it, and on a filled control that trades directly against the label. For the
CTA the trade has room, narrowly: its white text sits at 5.56–7.24:1 today, a fill just light
enough for 3:1 against the lightest dark card leaves that text at about 5.4:1, and white stays at
AA until the fill is about a quarter lighter again in luminance. The two stops would have to fit
inside that band, which nearly flattens the gradient, and the hover brightening takes the label
under 4.5:1 at the band's light end. (An earlier version of this file said such a fill drops
the text to ~4.0:1; that figure is white on the originally drawn `#0e8aa8`, which is well past
3:1, not at it.) The project has **not** taken that change (#1840): the dark CTA is covered by
rule 2 instead, and `--riv-cta-grad` stays declared once. The spec keeps the band measured
(› "a lighter dark fill could clear 3:1 and keep the label at AA, which is why leaving it is a
choice"). **Check the label before proposing a fill change.**

The figures above are the card's. On every other surface the CTA stands on, such a fill also keeps
the label at AA, with one exception (#1845). The room differs by surface (it is narrower where a
photo or the map can sit under the glass), so the card's figures are not a floor for the others.
The exception is the console's sticky save bars (the venue tab's and the layout editor's), which leave
none: their card glass has no blur, and an uploaded photo or the beach map scrolls
beneath it, so the lightest host there is the glass over white. A fill light enough for 3:1 against
that takes the white label under AA, so on those bars the lighter fill is not an alternative at all.
The spec asserts the answer per host (› "the untaken lighter fill against …: does the label keep
AA?").

**Caveat, stated rather than buried:** where the hairline is the carrier it is 1px, and the
normative text of 1.4.11 sets no minimum thickness for a component boundary (2.4.13 Focus
Appearance, AAA, does for focus indicators; 2.4.11 is Focus Not Obscured and is about hiding, not
thickness). The Understanding page does add a non-normative note on thin lines, quoted below.
The reading is defensible, not free. It is recorded as the project's position, and the CTA
independently carries a 3px `focus-visible` outline and an AA label, neither of which this
reading depends on, and which are what rule 2 rests the dark CTA on.

### What the W3C pages say about "adjacent" (read 2026-11-21)

Sources: SC text at `https://www.w3.org/TR/WCAG22/#non-text-contrast`; Understanding at
`https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html`. The SC says only "against
adjacent color(s)". The Understanding page defines it as the colours around the component:

> For user interface components 'adjacent colors' means the colors adjacent to the component. For
> example, if an input has a white internal background, dark border, and white external background
> the 'adjacent color' to the component would be the white external background.

and then speaks to a border that sits between two colours:

> If components use several colors, any color which does not interfere with identifying the
> component can be ignored for the purpose of measuring contrast ratio. For example, a 3D
> drop-shadow on an input, or a dark border line between contrasting backgrounds is considered to
> be subsumed into the color closest in brightness (perceived luminance).

Its Figure 3 measures white input background against dark blue surround and says the silver border
"is not required to contrast with either".

What follows for rule 1. **The source does not state "the layer that abuts is the boundary".**
That sentence is the project's reading. The source's own method for a bordered component is the
other way round: a border that does not help identify the component is ignored, and the ratio is
taken across it (fill against the host). Rule 1 is consistent with the source only where the
border *does* help identify the control, which is the case for the CTA's dark-theme hairline
(white 0.4 over the fill, 1px, the one layer that clears 3:1 against the near-black card). The
pages do not say that case either way: the "subsumed" sentence is about a border "between
contrasting backgrounds", and in the dark theme the CTA's fill and its card are the pair that does
not contrast. So rule 1's answer for the dark CTA is the project's position and not the source's.
A reviewer who applies the "subsumed" sentence to it would measure fill against card
(2.23–3.16:1 in dark, per #876). **The dark CTA therefore does not rest on rule 1.** By the
owner's decision on #1840 it is a rule 2 family: its white label identifies it at AA, which is the
case the page's *Boundaries* section exempts in its own words, whichever way the hairline is read.
Rule 1's hairline reading stays as the supplementary position, and the hairline as the boundary
the page encourages but does not require. Also from the same page:

> Due to anti-aliasing, particularly thin lines and shapes of non-text elements may be rendered by
> user agents with a much fainter color than the actual color defined in the underlying CSS. [...]
> Although not normatively required, in these cases authors are encouraged to avoid particularly
> thin lines and shapes, or to use a combination of colors that exceeds the normative requirements
> of this success criterion.

That is the 1px caveat above, from the source: not required, but discouraged.

Every citation of rule 1 inherits the "adjacent" caveat above, not only the CTA's: where a
hairline does not help identify its control, the source's method measures fill against host, and
rule 1 does not rescue that family. Such a family is argued under rule 2 (with its own measured
assertion), never by citing rule 1.

## Rule 2 — A control identified by its own content is not required to carry a 3:1 boundary

> **Where a filled control's identity is carried by its own text or glyph at AA, its boundary
> is decorative, and 1.4.11's "required to identify" does not reach it.**

This is the argument that had been made informally four times and is now the settled position.
The Understanding page's *Boundaries* section is its source, and states it more directly than
this file did:

> This success criterion does not require that controls have a visual boundary indicating the hit
> area. If a control has visible content (such as text or a sufficiently contrasting icon), which
> helps users identify the presence of the control, then a border or other indication of the
> overall boundary of the hit area is not required, as is therefore not subject to non-text
> contrast requirements. Having a visual boundary indicating the hit area is only required when
> there is no other visual way to identify the presence of the control – and in those cases, the
> boundary must have sufficient non-text contrast in order to pass this success criterion.

The same section adds that such a control "will still need to have a sufficiently contrasting focus
indication" (the 3px ring under #890, below) and that delineating every boundary is encouraged,
not required. The conditions below are the project's guard rails on top of that text.

It applies where rule 1 does **not** rescue a family: pale fills on pale glass, where neither
the fill nor the border abuts the card at 3:1 in the light themes; and the primary CTA in the dark
theme, where rule 1's answer is the project's reading and not the source's.

Three conditions, all required:

1. **The content carries the identity** — a text label or glyph on the control, measured at AA
   against the control's own fill.
2. **The number is measured, never waved off.** Each family below records its actual ratio in
   an assertion. "Decorative" is a conclusion drawn from a measurement, not a way to skip one.
3. **The control paints a real `border`** — which is what makes rule 3 apply to it.

**A decorative graphic is a different ground, and keeps its own name.** 1.4.11 reaches *user
interface components* and *meaningful* graphics; an `aria-hidden` ornament whose meaning is
carried by a labelled sibling is outside the criterion altogether. The ground is the SC's "parts of
graphics *required to understand the content*", and the Understanding page's own reading of it:
a graphic "for aesthetic purposes that does not require the user to see or understand it to
understand the content or use the functionality" is not required for understanding. ("Pure
decoration" is 1.1.1's wording, not 1.4.11's; do not quote it as this criterion's.) Do not cite
rule 2 for one — rule 2 is about a **control** identified by its content,
and blurring the two would let anything pale claim the exemption. Cite **rule 2a** instead, and
demonstrate the same second condition: the number is still measured.

### The families this rule covers

Each links to the spec that owns its arithmetic. **Do not restate ratios here** — one
number-bearing surface, not two.

| Family | Measured by |
|---|---|
| `--riv-solid-btn-border`, `--riv-solid-btn-danger-border` | `app/booking/solid-btn-tokens.contrast.spec.ts` |
| `--riv-accent-border` (the info panel's edge) | `app/admin/accent-tokens.contrast.spec.ts` |
| `--riv-accent-chip-border` (`shared/segmented-control.ts`'s selected option — **not** the amenity chip, which wears the opaque `--riv-accent-strong` and clears 3:1) | `app/admin/accent-tokens.contrast.spec.ts` |
| `--riv-medallion-negative-border` (**rule 2a** — `aria-hidden` glyph, its outcome card's heading carries the meaning) | `app/shared/fixed-fill-token-skins.contrast.spec.ts` |
| `--riv-amenity-tag-border`, `--riv-amenity-water-border` | `app/shared/fixed-fill-token-skins.contrast.spec.ts` (`amenities.contrast.spec.ts` is the same family's ink/fill text pairs, not these borders) |
| `--riv-warn-edge/50` on `daily-view-tab`'s close-sales trigger — the button's own label carries the identity | `app/operator/daily-view-tab.contrast.spec.ts` |
| `--riv-solid-fill-brand` as the operator account chip's avatar disc — the chip's non-text anchor on the header glass, measured at ≥ 3:1 over every porcelain stop; the chip's `--riv-chip-border` hairline is the tourist header's token and decoration under rule 2 (the label carries the identity) | `app/operator/operator-account-chip.contrast.spec.ts` |
| the primary CTA, `[appPrimaryCta]`'s `--riv-cta-grad` fill under the `--riv-cta-border` hairline, **in the dark theme** (#1840), on every surface it stands on there (#1845): the white label carries the identity, resting and hovered, and the fill against each dark host is a measured band whose floor is under 3:1. The spec names each host with the call-site files that stand on it and counts the CTAs in each file; it fails when a count changes or a file sits on no host, so a new site is placed before it merges. One site needs no exemption: booking-view's Pay now stands on the awaiting banner's fixed light fill in every theme, where the fill clears 3:1 against the banner. In the light themes the fill clears 3:1 against the card and needs no exemption | `app/shared/cta-border-token.contrast.spec.ts` › "meets rule 2's three conditions: an AA label resting and hovered, a measured boundary, a real border" and › "the dark fill against … is a measured band"; the popover host (the calendar's Apply, the partly-free sheet's retry) in `app/shared/availability-calendar.contrast.spec.ts` › "the Apply rests on rule 2 in the dark palette" |
| the theme row's swatch circle in the account menu and phone sheet (**rule 2a** — an `aria-hidden` ornament; the row's `Colour theme` label and its value carry the meaning). Its white inset hairline clears 3:1 over the darker swatch stops and vanishes over the palest, which is why rule 1 cannot carry it | `app/app.contrast.spec.ts` |

`--riv-console-card-border`'s one remaining consumer is not a control at all: it is the edge of the
console's "Venue not found" card, a `<div>`. The card's edge is outside 1.4.11 rather than exempt
under rule 2 — the criterion reaches visual information *required to identify* components and
states, and nothing about that card is identified by its hairline. Named here rather than left to be
re-derived, because a family whose consumers sit on different grounds is exactly where a later sweep
files the whole thing under the wrong one. Both values are measured in the same spec either way
(#849). The pending-approval notice's `--riv-warn-edge/55` hairline is the same case — the edge of a
`role="status"` `<div>` whose text carries the notice — measured per console theme in
`app/operator/pending-approval-banner.contrast.spec.ts` (#1010).

**`--riv-console-btn-hover` was the first entry here that was not a boundary at all** — the
sign-out button's hover fill, a *state* rather than an edge, which the project holds to the same
measure (the SC itself is more lenient about hover; see the note below). It
and `--riv-console-btn-border` retired with that button when the account chip folded sign-out
into a popover row painted from the `--riv-pop-*` family; the row's ground is the popover's, above.
What the entry established stays true of any future state token: it is listed rather than left
out, rule 2's three conditions are what answer it, and its numbers are measured in a spec rather
than waved off. The focus indicator is a separate question, settled by
[#890](https://github.com/ivopogace/riviera-sunbed-booking/issues/890): every `<button>` — the
account chip included — paints the project's 3px `--riv-accent-ink` ring from the `@layer base`
rule in `tailwind.css`, so the indicator is never the user-agent default (guard:
`app/shared/focus-ring-baseline.spec.ts`; render: `e2e/focus-ring-baseline.e2e.ts`, which reads
the ring off the chip).

**The general shape, worth keeping when the next state-coloured token arrives:** a hover, active
or selected fill is judged on the same three conditions as a border. What changes is only which
adjacency you measure — a state fill has two (the state it replaces, and the surface it sits on),
and both belong in the assertion.

**This is project policy, stricter than the SC for hover.** The Understanding page says the SC
"does not require that changes in color that differentiate between states of an individual
component meet the 3:1 contrast ratio when they do not appear next to each other. For example,
there is not a new requirement that visited links contrast with the default color, or that mouse
hover indicators contrast with the default state", and that author hover treatments "are not
'required to identify' the hover state" and "do not themselves need to contrast 3:1 against the
background". What it does require: the component "must not lose contrast with the adjacent
colors", and the indicators of other states (selected, focused, a checkbox's check) must reach 3:1
against their adjacent colours. So a *selected* fill is reached by the SC on its face; a *hover*
fill is not, and measuring it against the state it replaces (below, and
`--riv-wash-hover-border`, asserted in `app/booking/booking-dialog.contrast.spec.ts`) is a choice
this project makes, kept because that spec and the families' specs already assert it. Do not cite 1.4.11 as the reason for that second adjacency.

`booking-dialog`'s `#31798a` close button is the sharpest case and is covered here rather than
by rule 1: on its own teal header gradient the fill reaches 1.12–1.46:1 and the hairline
2.33–3.03:1, so only the darker header stop clears 3:1 by adjacency. Its identity rests on the
white `×` glyph at 4.96:1 — condition 1, met.

The close-sales trigger is the family that shows how one gets **found** rather than introduced.
#879's alpha ladder moved `--riv-warn-edge` from `#d9861a` to `#e0a03a`, taking that hairline from
1.65:1 to 1.48:1 on its own `white/60` fill — but it was sub-3:1 at *both* values and carried no
entry here at all. The slice did not create the exemption; it made one visible that had never been
written down. Worth remembering when a palette change looks like it is "introducing" a 1.4.11
problem: check what the outgoing value measured first.

**What this rule is not.** It is not a blanket exemption for chrome that happens to be pale,
and adding a family to the table above needs the same three conditions demonstrated, in an
assertion, in the same PR. A boundary that is genuinely the *only* thing identifying a control
— `--riv-danger-action-border` on the erasure panel's Erase button, `--riv-wash-hover-border`
on the dialog Back button's hover state — is held to 3:1 and tuned per theme to get there.
Those two are the standing precedents for the other answer.

## Rule 3 — Forced-colors mode is the fallback, and its precondition is guarded

Every family under rule 2 paints a real CSS `border`, and nothing in `frontend/src` opts out of
forced-colors mode. So when a user enables OS high-contrast, the user agent repaints each of
these boundaries with a system colour, independently of the alpha we chose — the low-contrast
hairline stops being the only boundary available.

This is **supporting ground, not the whole argument**: rule 2's three conditions stand on their
own, and forced-colors is what makes the residual risk acceptable rather than what makes the
exemption valid. It is scoped to families painting a real `border` for a reason — a boundary
carried by a gradient or a `box-shadow` is not equivalently rescued, since forced-colors does
not force those.

The precondition is guarded, not assumed:
`app/shared/cta-border-token.contrast.spec.ts` › "nothing opts out of forced-colors, which is
what the fallback clause rests on" fails if any future slice writes
`forced-color-adjust-none`. If that guard ever goes red, this rule's third clause is void for
the opted-out surface and that surface needs rule 2 re-argued on conditions 1 and 2 alone.

---

## How to cite this file

A token comment that previously deferred to an issue now names the rule:

```
Non-text chrome (WCAG 1.4.11) at <measured>:1 over its own fill — decorative under
docs/design/non-text-contrast.md rule 2 (the label carries the identity), measured
rather than assumed exempt. Proof: <spec name>.
```

**A state fill cites two adjacencies, not one** — the template above is a boundary's shape, and
copying it literally for a hover, active or selected fill silently drops one of the two
measurements rule 2 requires of it (see `--riv-console-btn-hover` above):

```
Non-text chrome (WCAG 1.4.11) at <measured>:1 over <the resting state it replaces> and
<measured>:1 over <the surface it sits on> — decorative under
docs/design/non-text-contrast.md rule 2 (the label carries the identity at <measured>:1
on this fill), measured rather than assumed exempt. Proof: <spec name>.
```

Citing a **closed issue** as a present-tense tracking home is what #876 existed to fix; don't
reintroduce it. Citations of #834 that record the erasure-panel work it actually completed are
history and stay as they are.

## A note on sourcing

Verified against the primary pages on 2026-11-21 (#1833), by fetching
`https://www.w3.org/TR/WCAG22/#non-text-contrast` and
`https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html`; the SC text was also
compared with `https://www.w3.org/TR/WCAG21/` and is identical. The normative text this file
paraphrases matches: AA; 3:1 "against adjacent color(s)"; "Visual information required to
identify user interface components and states, except for inactive components or where the
appearance of the component is determined by the user agent and not modified by the author"; and
"Parts of graphics required to understand the content, except when a particular presentation of
graphics is essential to the information being conveyed". The inactive-component exception is not
used by any rule here (a disabled control is "visible but not currently operable" and exempt on
the page's own words).

Corrected by that check, none of it touching a colour, token or threshold: rule 1's "adjacent
means the layer that abuts" is the project's reading and the source's method differs (see *What
the W3C pages say about "adjacent"*); "pure decoration" was 1.1.1's wording, not 1.4.11's;
2.4.11 is Focus Not Obscured, not a thickness rule; and the second adjacency for hover fills is
project policy, not something the SC asks. Confirmed and now cited: rule 2's boundary argument is
the Understanding page's *Boundaries* section. Re-verify on a WCAG revision; the dated read is
the one above.

#1840, same day and same pages: the owner chose to record the dark-theme CTA under rule 2 and not
to change a colour. That pass re-measured the CTA from the tokens and corrected rule 1's corollary,
which had said no fill could clear 3:1 against the dark card and keep the label at AA.

#1845, same day and same pages: the dark CTA measured on every surface it stands on, not on the card
glass alone. No colour, token or threshold moved. The surfaces were read from the templates and the
dark token block, then confirmed in the running app where reading left doubt. Hosts that real
content can pass under (a photo, the map) are measured over `WORST_PHOTOS`' white and black
extremes, the photo bands' convention; a dialog, popover or sheet is measured over its scrim and
that content, since a scrim over a light photo is lighter than any dark page stop. Changes: rule 2's row covers each dark host; booking-view's light banner is
recorded as the one site where the fill clears 3:1 by itself; the calendar's Apply is restated under
rule 2 in its own spec, with rule 1's assertion kept beside it; the corollary's "has room" is scoped
to the hosts where it holds.

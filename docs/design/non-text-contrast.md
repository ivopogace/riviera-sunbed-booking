# Non-text contrast — the project's settled position on sub-3:1 chrome

**Status:** living rule. Adopted by [#876](https://github.com/ivopogace/riviera-sunbed-booking/issues/876)
after the question had been deferred four times to
[#834](https://github.com/ivopogace/riviera-sunbed-booking/issues/834), an issue that was
scoped to the erasure panel and closed as completed on 2026-08-31. This file is the **live
home** those deferrals now point at. It is maintained, like
`colour-literal-token-audit.md` and unlike the `.dc.html` records — see `README.md`.

WCAG 2.1 SC 1.4.11 (Non-text Contrast, AA) asks that *visual information required to identify
user interface components and states* reach 3:1 against **adjacent** colour(s). The Liquid
Glass design puts pale fills on pale glass, so the question "is this boundary a violation or
is it decoration?" recurs on nearly every token family. This file answers it once, so token
comments cite a rule instead of re-deferring.

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
is right and the pairing is wrong: the white `--riv-cta-border` hairline sits **between** the
fill and the glass, so fill-vs-glass is not an adjacency. Measured correctly, the CTA's
boundary against its host card clears 3:1 in every theme — and the carrier swaps, because the
fill is a fixed mid-teal that the themes move *around* rather than *with*:

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
lightening can reach it, and on a filled control that trades directly against the label — the
CTA's 15px bold white text sits at 5.56–7.24:1 today, and the lightest teal that lifts the
fill's own boundary past 3:1 drops that text to ~4.0:1, under AA. **Check the label before
proposing a fill change.**

**Caveat, stated rather than buried:** where the hairline is the carrier it is 1px, and 1.4.11
sets no minimum thickness for a component boundary (unlike 2.4.11/2.4.13 for focus
indicators). The reading is defensible, not free. It is recorded as the project's position,
and the CTA independently carries a 3px `focus-visible` outline and an AA label, neither of
which this reading depends on.

## Rule 2 — A control identified by its own content is not required to carry a 3:1 boundary

> **Where a filled control's identity is carried by its own text or glyph at AA, its boundary
> is decorative, and 1.4.11's "required to identify" does not reach it.**

This is the argument that had been made informally four times and is now the settled position.
It applies where rule 1 does **not** rescue a family: pale fills on pale glass, where neither
the fill nor the border abuts the card at 3:1 in the light themes.

Three conditions, all required:

1. **The content carries the identity** — a text label or glyph on the control, measured at AA
   against the control's own fill.
2. **The number is measured, never waved off.** Each family below records its actual ratio in
   an assertion. "Decorative" is a conclusion drawn from a measurement, not a way to skip one.
3. **The control paints a real `border`** — which is what makes rule 3 apply to it.

**A decorative graphic is a different ground, and keeps its own name.** 1.4.11 reaches *user
interface components* and *meaningful* graphics; an `aria-hidden` ornament whose meaning is
carried by a labelled sibling is outside the criterion altogether, by its own "pure decoration"
carve-out. Do not cite rule 2 for one — rule 2 is about a **control** identified by its content,
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
| `--riv-console-btn-border` (the console's sign-out button) and `--riv-console-card-border` on the **active tab pill** — each control's own label carries the identity | `app/shared/fixed-ink-tokens.contrast.spec.ts` |
| `--riv-console-btn-hover` (that same button's hover fill) — a **state**, not a boundary; read below before citing this row | `app/shared/fixed-ink-tokens.contrast.spec.ts` |

`--riv-console-card-border`'s **other** consumer is not a control at all: it is the edge of the
console's "Venue not found" card, a `<div>`. It is listed above only for the tab pill; the card's
edge is outside 1.4.11 rather than exempt under rule 2 — the criterion reaches visual information
*required to identify* components and states, and nothing about that card is identified by its
hairline. Named here rather than left to be re-derived, because a family whose two consumers sit on
different grounds is exactly where a later sweep files the whole thing under the wrong one. Both
values are measured in the same spec either way (#849).

**`--riv-console-btn-hover` is the first entry here that is not a boundary at all**, and it is
listed rather than left out because the criterion does not let it be. 1.4.11 reaches visual
information required to identify components *and states*, so a hover fill is in scope on its
face — and both boundaries it forms are far under 3:1: against the resting white it replaces,
and against the porcelain header glass it sits on. Rule 2's three conditions are still what
answer it, and all three hold — the button's own "Sign out" label clears AA on the hovered fill,
the numbers are measured in the spec above rather than waved off, and the control paints a real
`border`, which is what brings rule 3 to it.

Two things narrow the residual risk, and neither is offered as the argument. A pointer hover is
unavailable to keyboard and touch users altogether, so it cannot be what identifies this control
*to them*; the button's focus indicator is a separate question, and today an unstyled one — named
here so a later slice finds the gap written down rather than implied away. And the separation is
not an outlier this project has never accepted: it is at least that of `--riv-solid-btn-fill` →
`--riv-solid-btn-hover`, the settled family two rows up. That comparison is asserted, not
asserted-here — `app/shared/fixed-ink-tokens.contrast.spec.ts` › "separates from its resting fill
at least as well as the settled solid-btn family does" reads both sides out of `tailwind.css`, so
retuning either family moves the claim instead of stranding a stale number in this file.

**The general shape, worth keeping when the next state-coloured token arrives:** a hover, active
or selected fill is judged on the same three conditions as a border. What changes is only which
adjacency you measure — a state fill has two (the state it replaces, and the surface it sits on),
and both belong in the assertion.

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

The normative SC text was confirmed from secondary sources in the session that wrote this
file — `w3.org` is blocked by the network egress proxy in the cloud sessions this repo is
developed from, so the primary page could not be fetched. The reading in rule 1 ("adjacent"
means the layer that abuts) is the project's position, argued above, not a quotation. A later
session with unrestricted egress should re-verify it against
`https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html` and correct this file if
the primary text contradicts anything here.

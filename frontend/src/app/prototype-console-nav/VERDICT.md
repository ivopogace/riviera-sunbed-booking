# Console nav spike — verdict

**Question:** what form should the operator/admin console navigation take, given that the pill
recipe is spoken for by the read-only chips (`amenity-chip`, `status-chip`) and the tourist header
shipped underlined text tabs (variant H, #1002/#1003)?

**Recommendation: variant D, "One shell"** (`console-nav-d.ts`; decided and redrawn as **G** — see _The decisions_ below) — one chrome for every operator
and admin route: a section row (brand · the venue switcher, which _is_ the venue-console section ·
`Admin` for admins · one account chip) above a tab rail of underlined text tabs on a shared
hairline, grouped by thin dividers. Two departures in it are the maintainer's to confirm, not
mine (the grill below): dropping the admin pills the design canvas drew, and merging the two
chromes.

Nothing on this branch merges. It is the primary source behind the rebuild.

## How the candidates were judged

`prototype-shots/shoot-console.mjs` renders every candidate on the surfaces that discriminate —
daily view, beach map, requests, `/admin`, `/admin/audit`, the `/operator` landing, a signed-out
admin tab, and the phone twins — and `sheet-console.mjs` stacks them per view in
`prototype-shots/console/`. Signed in as an operator who is also the platform admin and owns two
venues, so every switcher has something to switch to.

| Variant                | What the surfaces showed                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `current`              | The overflow case is not a phone case: at 1280px the admin strip already cuts `Audit` inside its 860px section. On a phone the five account links wrap to three rows above the stats, and the venue name is 10px tracked uppercase — the least legible word in the bar is the one invariant #13 needs read.                                                                                                        |
| `b` Tab rail           | The smallest change: same two chromes, pills → underlined tabs on a hairline. All eight admin tabs fit the 1120px bar at 1280px; on a phone the cut tab at the edge is the overflow cue no mask ever gave. Runner-up, and D's rail is this rail.                                                                                                                                                                   |
| `c` Sidebar            | The best _reading_ of nine admin destinations — five labelled groups — and the venue switcher as the first row. But it spends 240px on the one page whose content is a horizontal grid: at 1280px the beach map loses fit-to-width (columns 11–12 scroll) where every other candidate shows all twelve. The phone fold (bottom bar of four + a `More` sheet) also puts current inside a sheet, the #710 objection. |
| `d` One shell          | Survives every surface. The venue name is a control at title weight, current-marked as a section; switching venue keeps the tab; `/operator` and the password page wear the same bar so no operator page dead-ends. Nine admin destinations read as five clusters without ranking any of them into a menu. Cost: two sticky rows (~90px on a phone).                                                               |
| `e` Palette            | The cleanest phone bar of the six and a good ⌘K — and on every desktop shot nothing on the page says what else exists. A palette is a keyboard accelerator, not a primary nav, so it is a later add-on to whichever shape wins, not a candidate.                                                                                                                                                                   |
| `f` Ranked rail + More | The right answer to #710's objection (the trigger carries `aria-current` and the current child's label: `More · Audit`), but ranking is a guess the maintainer has not made, and it does not buy the phone anything: five admin primaries plus `More` still exceed 390px, and as built the non-scrolling rail pushes `More` off-screen.                                                                            |

Colour was held constant; only structure varied. Every candidate obeys the hard rule (no
`rounded-full` + border + padding shape routes anywhere), demotes the five account peers into one
chip, and marks current with full ink plus an underline or fill (`--riv-accent-ink` vanishes on
the header glass, #984).

## The decisions — the grill, answered

The maintainer narrowed the field to C and D, then answered sixteen questions. The answers are
the contract for the rebuild; variant **G** (`console-nav-g.ts`) is D redrawn to them so the
result could be shot before anything is built.

| #   | Question                          | Answer                                                                                                                                                                       |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Where does the manager stand?     | Venue console phone-first, laptop second; admin console laptop-first.                                                                                                        |
| 2   | The beach-map budget              | Fit-to-width at 1280px stays. C's sidebar reaches it only at 1440px (grid frame 652px vs 892px at 1280) — this is what removed C.                                            |
| 3   | Current inside More               | A More that carries the current child's label and `aria-current` **is** acceptable — #710's objection is met that way.                                                       |
| 4   | One model or two?                 | One model: D, with C's grouping as dividers.                                                                                                                                 |
| 5   | One marker across the product     | Yes: full ink plus the 3px underline on the rail's hairline, the tourist header's marker.                                                                                    |
| 6   | Two chromes become one            | Yes, now. `app-operator-chrome` and the console's own header retire; the landing and password page wear the shell.                                                           |
| 7   | Venue console order               | Today first, grouped: Daily view · Requests \| Beach map · Pricing · Venue \| Payouts.                                                                                       |
| 8   | Admin order                       | **Adopt the regrouping** — `ADMIN_CONSOLE_TAB_ORDER` and its spec are amended: Operators \| Email · Refunds \| Photos · Reviews \| Commissions · Payouts \| Privacy · Audit. |
| 9   | Stats strip / sticky chrome       | Only the section row is sticky; the rail scrolls with the page; the strip sits under the rail.                                                                               |
| 10  | The phone rail                    | More on **both** consoles below `sm`.                                                                                                                                        |
| 11  | The venue switcher                | As drawn: the name is the control, the tab is kept across a switch, plain text with one venue, the `/operator` picker stays for a bookmark with no venue.                    |
| 12  | Create a venue                    | Under the venue switcher only; the chip holds Signed in as · Change password · Sign out.                                                                                     |
| 13  | Which tabs stay on the phone rail | The recommended three plus More (Daily · Requests · Beach map; Operators · Email · Refunds) **if it fits a Galaxy Z Fold 5 at 344px** — G is shot at 344px to prove it.      |
| 14  | Theme                             | Two console themes, porcelain and dark, chosen in the console — not the tourist theme, and not the branded `riviera`.                                                        |
| 15  | Deferred items                    | Nothing deferred: the ⌘K palette, icons on the phone rail, and the section row hiding on scroll are all in scope.                                                            |
| 16  | Next step                         | Update the verdict and prototype the decided shape; the maintainer decides on the screenshots before any issue is opened.                                                    |

Answer 8 is the one that touches a written contract, and it is now the maintainer's decision on
record, not the prototype's.

## What G showed

Shot on every view, both console themes, plus the Galaxy Z Fold 5 cover screen (344px). The
sheets in `prototype-shots/console/` whose name carries `-fold`, `-themes`, `palette-open`,
`theme-open` and `more-open-*` are G's.

- **344px fits.** Three glyph-over-label tabs plus More sit on one row with room to spare on both
  consoles (`sheet-daily-fold`, `sheet-audit-fold`). Q13's condition holds, so the recommended
  ranking stands: Daily · Requests · Beach map and Operators · Email · Refunds.
- **The More trigger carries the current page.** On `/operator/1/payouts` the fourth slot reads
  `Payouts` with the payouts glyph and the underline; on `/admin/audit` it reads `Audit`
  (`sheet-more-open-phone`, `sheet-more-open-fold`). The sheet lists the rest grouped, with the
  cross-console row (`Admin console` / `Your venues`) at the foot.
- **The section row does not fit a phone with everything in it.** First draw: brand, venue chip,
  `Admin`, ⌘K and the avatar collided at 390px and 344px. Fixed by taking `Admin` and ⌘K out of
  the row below `sm` (Admin moves into the More sheet; the palette is a keyboard accelerator and a
  phone has no ⌘). The rebuild inherits that rule.
- **Sticky chrome is one row.** 46px on a phone, sliding away on scroll-down (`max-sm`), against
  the shipped console's 190px before the stats.
- **The beach map keeps all twelve columns at 1280px** (`sheet-beach-map`, G row) — the budget
  Q2 fixed.
- **Dark is a restyle, not a nav option.** The shell itself is fine in dark: the header, pop and
  chip tokens all have a dark branch. The console _content_ does not (`sheet-daily-themes`,
  `sheet-beach-map-themes`, `sheet-requests-phone-themes`): the date field, the sales-close and
  Decline outline buttons and the layout editor's tool chips paint literal light fills as grey
  slabs, and the walk-in tiles vanish against the dark sand. So Q14's second theme is a slice of
  its own — every `--riv-console-*` token and every light literal in the six tabs gets a dark
  value, with the contrast specs extended — and the switch ships only once that slice lands. The
  nav rebuild carries the switch's home (the chip) and the pin, not the theme.
- **The palette earns its slot** as an accelerator: nine admin destinations plus two venues plus
  the account page in one filtered list (`sheet-palette-open`, G row).

## What D decided before the grill, and what it needed

The grill the brief asked for could not run in this session (no maintainer present), so each
question carries my proposed answer and what a different answer changes.

1. **Target device.** Proposed: the venue console is phone-first (Daily view and Requests are
   on-the-beach jobs; Requests is time-critical), the admin console laptop-first. D serves both
   from one component; C is the laptop answer and pays for it on the beach map. If the console is
   laptop-only, C's grouping deserves a second look with the sidebar collapsed to an icon rail on
   the beach-map tab.
2. **Do the two chromes become one?** Proposed: yes — D. `app-operator-chrome` and the console's
   own header exist because the console went chromeless (`data.operatorConsole`); D is one shell
   with a section row, so the flag becomes "which section". If no, the pick is B: the same rail
   under each of today's two headers, nothing else moved.
3. **Multi-venue switching.** Proposed: the venue name in the bar is the switcher
   (`proto-venue-switch.ts`): owned venues under it, the current tab kept across the switch,
   `+ Add another venue` at the foot; with one venue it renders as plain text. This is also the
   invariant #13 answer — the venue is the biggest word in the bar, in full ink, and the control
   you would use to change it sits on it. The `/operator` picker stays as the landing for a
   bookmark that has no venue.
4. **Are the nine admin tabs peers?** Proposed: peers in order, grouped, not ranked — D draws
   hairline dividers at group boundaries and hides nothing. `ADMIN_CONSOLE_TAB_ORDER` is a written
   contract, and its own TSDoc already names the groups ("the console home, then the money …,
   then the two outbox levers, then moderation, then erasure, and Audit last"). **The rebuild
   should keep that order and add dividers at those boundaries**: Operators | Commissions ·
   Payouts | Email · Refunds | Photos · Reviews | Privacy · Audit — so `admin-console-tabs.spec.ts`'s
   subsequence test holds unchanged. The prototype's `ADMIN_NAV` groups differently (Money after
   Moderation) to make the grouping visible in the shots; that reorder is _not_ the recommendation.
   The operator tabs are reordered too (Today: Daily view · Requests | Set-up: Beach map · Pricing
   · Venue | Money: Payouts, against the shipped Beach map · Pricing · Daily · Requests · Payouts ·
   Venue). That one I do recommend — a running venue opens Daily and Requests every day and the
   beach map once — but it is a maintainer call. If the answer is "ranked", F's `More` is the
   mechanism, and the phone still needs the rail to scroll.
5. **Does `Signed in as <email>` deserve bar space beside Requests?** Proposed: no. Every
   candidate folds Create a venue · Admin · Change password · Signed in as · Sign out into one
   account chip (`proto-account-menu.ts`); the shots of `current` show the flat row taking the
   phone's first 190px. `Admin` keeps a bar slot in D because it is a section, not an account
   action.
6. **Theme.** Proposed: keep the porcelain pin, no switcher. The brief's premise that
   `app-operator-chrome` is unpinned is stale: `app.ts` binds `data-riv-theme="porcelain"` on the
   shell host for every `operatorChrome` route, and `THEME=dark` shots of `/admin` show no seam.
   D's one shell would carry the pin once, on its own host, as the console does today.

## Corrections from the page pass

Faults in the candidates as first drawn, fixed on the branch and re-shot:

1. The brand was a shrinking flex item, so at 390px "Operator" was painted under the venue name
   (B, F) and under `Admin` (F). The brand is now `shrink-0`; the "Operator" word and the account
   handle hide below `sm`.
2. The venue switcher said `Choose a venue` on admin pages and rendered for a signed-out visitor
   (D). It now says `Your venues` off the console and renders nothing signed out.
3. F's rail kept the scrolling recipe, which clipped its own `More` popover. The ranked rail does
   not scroll, which is what exposed the phone flaw recorded above.
4. C's sidebar rendered three empty group labels on `/operator`; it now lists the owned venues
   there, which is the picker as a permanent surface.
5. The palette's search input declared no touch target (`check-touch-target` TT-1).

Two things noticed in the shipped chrome while shooting, outside this spike: the
`app-operator-chrome` brand renders as `RivieraOperator` (no space; the console header has one),
and at 1280px the admin pill strip already scrolls.

## What D does not settle

- Whether the stats strip sits under the sticky rows (as drawn) or between the section row and
  the rail (as `current` places it under the header); the beach-map tab would rather not lose
  another 90px of viewport to sticky chrome.
- The phone still has no icons on the rail; C's bottom bar showed labels alone read fine at four
  slots, but D's rail at 390px relies on the cut-tab cue and the scroll-into-view of the current
  tab on load.
- Whether E's palette earns a ⌘K slot on D's account chip later — a keyboard accelerator for the
  nine-destination admin, never the primary nav.

## Rebuild — the slices for the Issue stage (`to-issues`)

The spike is the `prototype` half of riviera-sdlc's Plan row. Refine is done (the sixteen answers
above); the maintainer decides on G's screenshots, then `to-issues` cuts these tracer bullets,
each demoable alone:

1. **The rail primitive** — `shared/` gets the underlined-tab-on-a-hairline element (a component
   or variant directive per `riviera-tailwind` rule 1, never `@apply`), with `aria-current` as the
   marker source and the scroll-into-view of the current tab; `admin-console-tabs.ts` and
   `operator-console.html` consume it in place of their pill anchors. Contract pins:
   `admin-console-tabs.spec.ts` (order subsequence, dividers at the TSDoc's group boundaries),
   `admin-console-tabs.e2e.ts` and `operator-console.e2e.ts` (one row, current tab in viewport on
   click and on reload, no page overflow at 360px), a computed-style diff of the marker.
2. **The account chip** — one disclosure replacing `operator-actions.ts`'s five peers on both
   headers; sign-out stays an output so each host keeps its own teardown (focus parked on
   `<main>`, stores reset). e2e: `operator-chrome.e2e.ts`, `touch-targets*.e2e.ts`.
3. **The venue switcher** — `OwnedVenues` loaded on a deep-linked console (today only the landing
   loads it), the name-as-control with the tab kept across the switch, plain text with one venue.
   Invariant #13 pin: an e2e that switches venue and asserts every subsequent venue-scoped read
   carries the new id (`console-venue-switch.spec.ts` is the unit seam).
4. **One shell** — the section row hosting both consoles: `data.operatorConsole` and
   `data.operatorChrome` collapse into one route-data flag naming the section, `AdminConsole`
   keeps its gate but drops its strip into the shell, `app-operator-chrome` retires. The porcelain
   pin moves to the shell host; only the section row is sticky, hiding on scroll-down below `sm`.
   Ships the amended `ADMIN_CONSOLE_TAB_ORDER` (answer 8) and the Today-first operator order
   (answer 7), with `admin-console-tabs.spec.ts` amended in the same PR.
5. **The phone rail** — below `sm`, glyph-over-label primaries plus the current-aware More and
   its sheet (answers 3, 10, 13, 15). The glyphs land as `shared/` icon components per
   `riviera-tailwind` ICON-1..6. e2e: a 344px project in `touch-targets*.e2e.ts` and the
   current-tab assertions on `/operator/1/payouts` and `/admin/audit`.
6. **The palette** — ⌘K / Ctrl-K and the search glyph on the section row from `sm` up; focus
   returns to the opener; Enter opens the first hit. e2e over the keyboard path.
7. **The dark console theme** — dark values for every `--riv-console-*` token and every light
   literal the six tabs paint, the `*.contrast.spec.ts` extended to both themes, then the
   porcelain / dark rows in the account chip. Gated on the restyle, not on the shell (see _What G
   showed_).

Skills the rebuild loads at Implement: `riviera-frontend` (which folder each piece lands in — the
rail and chip are `shared/`, the switcher is `operator/` unless the shell needs it, in which case
it is `core/`), `riviera-tailwind` (rules 1, 4, 6), `angular-developer`, `playwright-cli`.

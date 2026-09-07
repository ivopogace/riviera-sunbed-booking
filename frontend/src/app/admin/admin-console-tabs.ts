import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TAB_RAIL_MATCH, TabRail, TabRailDivider, TabRailTab } from '../shared/tab-rail';
import { TouchTarget } from '../shared/touch-target';

/**
 * The console's canonical tab order as GROUPS — the strip's information architecture is an
 * order with hairline dividers at the group boundaries, not a layout (see {@link AdminConsoleTabs}).
 *
 * <p>Grouped by what the admin does, in the order the platform needs them: the console home
 * (accounts), then the two outbox re-drive levers (Email and Refunds share `OutboxLever`), then
 * moderation, then the money the platform sets and pays, then the records — erasure, and Audit last
 * because it is the record of all of the above. One slot is still reserved for a tab that does
 * not exist yet — <strong>Payouts</strong>; every tab that ships has landed in its slot without the
 * order being renegotiated, which is what writing it down bought.
 *
 * <p>This grouping is a maintainer decision from the console-nav spike's grill (its verdict,
 * answer 8), amending the earlier home-then-money order. The same decision departed from the admin
 * design canvas (`docs/design/riviera-admin-console.dc.html`), whose pill strip is not what ships:
 * the tabs are underlined text on one shared rail, in this order, grouped by these dividers.
 */
export const ADMIN_CONSOLE_TAB_GROUPS = [
  ['Operators'],
  ['Email', 'Refunds'],
  ['Photos', 'Reviews'],
  ['Commissions', 'Payouts'],
  ['Privacy', 'Audit'],
] as const;

/**
 * The canonical tab order, flat — {@link ADMIN_CONSOLE_TAB_GROUPS} in sequence.
 *
 * <p>This is the contract, not a snapshot: `admin-console-tabs.spec.ts` pins that the rendered tabs
 * are a <em>subsequence</em> of it, so adding a tab in its slot needs no spec edit while appending
 * one out of slot fails.
 */
export const ADMIN_CONSOLE_TAB_ORDER = ADMIN_CONSOLE_TAB_GROUPS.flat();

/** One rendered tab and whether a group divider precedes it. */
interface TabRow {
  readonly path: string;
  readonly label: string;
  readonly testId: string;
  readonly dividerBefore: boolean;
}

/** The group index a label belongs to, `-1` for a label outside the contract. */
function groupOf(label: string): number {
  return ADMIN_CONSOLE_TAB_GROUPS.findIndex((group) =>
    (group as readonly string[]).includes(label),
  );
}

/**
 * The platform-admin console's tab rail: underlined text tabs on one shared hairline
 * (`shared/tab-rail.ts`), grouped by dividers at {@link ADMIN_CONSOLE_TAB_GROUPS}' boundaries, in
 * {@link ADMIN_CONSOLE_TAB_ORDER}.
 *
 * <p><strong>Routed tabs, not local state.</strong> Each tab is its own child route of
 * {@code AdminConsole}, so it is deep-linkable, back-button-correct, and only the tab you opened is
 * downloaded — the operator console's own shape (`riviera-frontend`: "the one nested child-route
 * tree... follow that shape for further tabbed sub-apps"). Mounted once by the shell and kept alive
 * across tab switches, so its scroll position is never lost or reset.
 *
 * <p><strong>Scrolls, doesn't wrap.</strong> A single scrolling row, matching the operator console's
 * own tab bar so the two navs behave the same; no edge mask — the cut-off tab at the edge is the
 * overflow cue. An overflow menu was rejected because it can strand `aria-current` inside a
 * collapsed menu. The active tab scrolls into view on load and on every switch, which is the rail
 * tab's own mechanism. `e2e/admin-console-tabs.e2e.ts` pins the scrolling-row shape.
 *
 * <p><strong>Which tabs exist is a backend question.</strong> This rail lists what ships, which is
 * why Photos appears here without appearing on the design canvas at all: the canvas's Privacy tab
 * is scoped to GDPR data-subject erasure (built as drawn), and content moderation is a
 * different job. The canvas's own five-tab pill strip predates five of the tabs that ship and is
 * not the target IA.
 *
 * <p>Rendered by the console shell (`console-shell.ts`) under its section row, only past the admin
 * gate, so a signed-out visitor is never told which admin surfaces exist; the shell's 1120px box
 * gives the rail its width, the rail carries the row's own `px-6` inset. The active tab carries
 * `aria-current="page"`, which is what carries the marker to assistive tech rather than to sighted
 * users alone.
 */
@Component({
  selector: 'app-admin-console-tabs',
  imports: [RouterLink, RouterLinkActive, TabRail, TabRailTab, TabRailDivider, TouchTarget],
  template: `
    <nav appTabRail class="px-6 pt-3.5 scroll-px-6" [attr.aria-label]="label()">
      @for (row of rows; track row.path) {
        @if (row.dividerBefore) {
          <span appTabRailDivider></span>
        }
        <a
          appTabRailTab
          appTouchTarget
          [routerLink]="row.path"
          routerLinkActive
          [routerLinkActiveOptions]="match"
          ariaCurrentWhenActive="page"
          [attr.data-testid]="row.testId"
          >{{ row.label }}</a
        >
      }
    </nav>
  `,
})
export class AdminConsoleTabs {
  /** Names the rail for assistive tech; each page passes its own so two navs never read alike. */
  readonly label = input('Admin console');

  protected readonly match = TAB_RAIL_MATCH;

  /** The shipped tabs in canonical order, a divider marked wherever the group changes. */
  protected readonly rows: readonly TabRow[] = [
    { path: '/admin', label: 'Operators', testId: 'admin-tab-operators' },
    { path: '/admin/email', label: 'Email', testId: 'admin-tab-email' },
    { path: '/admin/refunds', label: 'Refunds', testId: 'admin-tab-refunds' },
    { path: '/admin/photos', label: 'Photos', testId: 'admin-tab-photos' },
    { path: '/admin/reviews', label: 'Reviews', testId: 'admin-tab-reviews' },
    { path: '/admin/commissions', label: 'Commissions', testId: 'admin-tab-commissions' },
    { path: '/admin/privacy', label: 'Privacy', testId: 'admin-tab-privacy' },
    { path: '/admin/audit', label: 'Audit', testId: 'admin-tab-audit' },
  ].map((tab, index, all) => ({
    ...tab,
    dividerBefore: index > 0 && groupOf(tab.label) !== groupOf(all[index - 1].label),
  }));
}

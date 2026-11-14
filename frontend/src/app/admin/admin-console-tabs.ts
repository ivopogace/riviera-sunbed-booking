import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { ConsoleDestination } from '../shared/console-destination';
import {
  AuditGlyph,
  CommissionsGlyph,
  EmailGlyph,
  OperatorsGlyph,
  PayoutsGlyph,
  PhotosGlyph,
  PrivacyGlyph,
  RefundsGlyph,
  ReviewsGlyph,
  VenueChangesGlyph,
} from '../shared/console-glyphs';
import { TAB_RAIL_MATCH, TabRail, TabRailDivider, TabRailTab } from '../shared/tab-rail';
import { TouchTarget } from '../shared/touch-target';

const OPERATORS = $localize`:admin console tab|Tab for operator accounts:Operators`;
const EMAIL = $localize`:admin console tab|Tab for undelivered confirmation mail:Email`;
const REFUNDS = $localize`:admin console tab|Tab for outstanding refunds:Refunds`;
const PHOTOS = $localize`:admin console tab|Tab for venue photo moderation:Photos`;
const REVIEWS = $localize`:admin console tab|Tab for review moderation:Reviews`;
const COMMISSIONS = $localize`:admin console tab|Tab for per-venue commission rates:Commissions`;
const VENUE_CHANGES = $localize`:admin console tab|Tab for venue-caused refunds and fees:Venue changes`;
const PAYOUTS = $localize`:admin console tab|Tab for venue payout batches:Payouts`;
const PRIVACY = $localize`:admin console tab|Tab for data-subject erasure:Privacy`;
const AUDIT = $localize`:admin console tab|Tab for the admin audit trail:Audit`;

/**
 * The console's canonical tab order as GROUPS, a hairline divider at each boundary (see
 * {@link AdminConsoleTabs}): accounts, outbox levers and refunds, moderation, money, records (Audit
 * last).
 */
export const ADMIN_CONSOLE_TAB_GROUPS = [
  [OPERATORS],
  [EMAIL, REFUNDS],
  [PHOTOS, REVIEWS],
  [COMMISSIONS, VENUE_CHANGES, PAYOUTS],
  [PRIVACY, AUDIT],
] as const;

/**
 * The canonical tab order, flat. A contract, not a snapshot: `admin-console-tabs.spec.ts` pins the
 * rendered tabs as a subsequence: a tab added in its slot passes, one appended out of slot fails.
 */
export const ADMIN_CONSOLE_TAB_ORDER = ADMIN_CONSOLE_TAB_GROUPS.flat();

/** The name of each group in {@link ADMIN_CONSOLE_TAB_GROUPS}, by index — what the phone rail's
 *  More sheet heads a group with (the epic's story 16). */
export const ADMIN_CONSOLE_GROUP_NAMES = [
  $localize`:admin console tab group|Heading for the accounts tabs in the More sheet:Accounts`,
  $localize`:admin console tab group|Heading for the outbox and refund tabs in the More sheet:Outboxes`,
  $localize`:admin console tab group|Heading for the moderation tabs in the More sheet:Moderation`,
  $localize`:admin console tab group|Heading for the money tabs in the More sheet:Money`,
  $localize`:admin console tab group|Heading for the records tabs in the More sheet:Records`,
] as const;

/** The group name a label belongs to, `undefined` for a label outside the contract. */
function groupNameOf(label: string): string | undefined {
  const index = ADMIN_CONSOLE_TAB_GROUPS.findIndex((group) =>
    (group as readonly string[]).includes(label),
  );
  return index < 0 ? undefined : ADMIN_CONSOLE_GROUP_NAMES[index];
}

/** A shipped tab: its route, label, test id, glyph and hint; the group comes from the contract. */
function shipped(
  path: string,
  label: string,
  testId: string,
  glyph: ConsoleDestination['glyph'],
  hint: string,
): ConsoleDestination {
  return { path, label, testId, glyph, hint, group: groupNameOf(label) ?? label };
}

/**
 * The shipped tabs in {@link ADMIN_CONSOLE_TAB_ORDER}, each with what the phone rail and its More
 * sheet need beyond the rail's label — the glyph, the one-line hint, the group name — so the two
 * rails and the sheet read one table.
 */
export const ADMIN_CONSOLE_TABS: readonly ConsoleDestination[] = [
  shipped(
    '/admin',
    OPERATORS,
    'admin-tab-operators',
    OperatorsGlyph,
    $localize`:admin console tab hint:Approve, suspend, reinstate`,
  ),
  shipped(
    '/admin/email',
    EMAIL,
    'admin-tab-email',
    EmailGlyph,
    $localize`:admin console tab hint:Undelivered mail, resend`,
  ),
  shipped(
    '/admin/refunds',
    REFUNDS,
    'admin-tab-refunds',
    RefundsGlyph,
    $localize`:admin console tab hint:Outstanding refunds, a guest’s day`,
  ),
  shipped(
    '/admin/photos',
    PHOTOS,
    'admin-tab-photos',
    PhotosGlyph,
    $localize`:admin console tab hint:Venue photo takedowns`,
  ),
  shipped(
    '/admin/reviews',
    REVIEWS,
    'admin-tab-reviews',
    ReviewsGlyph,
    $localize`:admin console tab hint:Hide or restore a review`,
  ),
  shipped(
    '/admin/commissions',
    COMMISSIONS,
    'admin-tab-commissions',
    CommissionsGlyph,
    $localize`:admin console tab hint:Per-venue rate schedule`,
  ),
  shipped(
    '/admin/venue-changes',
    VENUE_CHANGES,
    'admin-tab-venue-changes',
    VenueChangesGlyph,
    $localize`:admin console tab hint:Venue-caused refunds and fees`,
  ),
  shipped(
    '/admin/payouts',
    PAYOUTS,
    'admin-tab-payouts',
    PayoutsGlyph,
    $localize`:admin console tab hint:Weekly BKT batches`,
  ),
  shipped(
    '/admin/privacy',
    PRIVACY,
    'admin-tab-privacy',
    PrivacyGlyph,
    $localize`:admin console tab hint:Data-subject erasure`,
  ),
  shipped(
    '/admin/audit',
    AUDIT,
    'admin-tab-audit',
    AuditGlyph,
    $localize`:admin console tab hint:Every admin action, in order`,
  ),
];

/** One rendered tab and whether a group divider precedes it. */
interface TabRow {
  readonly path: string;
  readonly label: string;
  readonly testId: string | undefined;
  readonly dividerBefore: boolean;
}

/**
 * The admin console's tab rail (`shared/tab-rail.ts`) in {@link ADMIN_CONSOLE_TAB_ORDER}. Each tab
 * is a child route of {@code AdminConsole}; the shell mounts the rail once, only past the admin
 * gate, so a signed-out visitor never learns which admin surfaces exist. From `sm` up it scrolls,
 * never wraps, with the active tab scrolled into view; below `sm` the shell renders the phone rail
 * instead, its More slot carrying the current tab's label and `aria-current`
 * (`e2e/admin-console-tabs.e2e.ts` pins both).
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
  readonly label = input($localize`Admin console`);

  protected readonly match = TAB_RAIL_MATCH;

  /** The shipped tabs in canonical order, a divider marked wherever the group changes. */
  protected readonly rows: readonly TabRow[] = ADMIN_CONSOLE_TABS.map((tab, index, all) => ({
    path: tab.path,
    label: tab.label,
    testId: tab.testId,
    dividerBefore: index > 0 && tab.group !== all[index - 1].group,
  }));
}

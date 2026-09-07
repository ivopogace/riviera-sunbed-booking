import { IsActiveMatchOptions } from '@angular/router';

/**
 * PROTOTYPE — the bits every console-nav variant shares. The variants stay free to throw the
 * layout away; what they share is the vocabulary (which destinations exist, how they group and
 * rank) and the skins that are the same in every candidate (glass bar, badge, popover).
 */

/** Where the variant is rendering: the venue console, the admin console, or a plain operator page
 *  (`/operator` landing, `/account/operator-password`) that today wears `app-operator-chrome`. */
export type ConsoleSurface = 'operator' | 'admin' | 'plain';

export interface ConsoleNavContext {
  readonly surface: ConsoleSurface;
  readonly venueId?: number;
  readonly venueName?: string;
  readonly requestsCount: number;
  /** Admin only: the tab strip must never render for a visitor who has not passed the role gate. */
  readonly navHidden?: boolean;
}

export type NavRank = 'primary' | 'secondary';

export interface NavItem {
  /** Router path: a console child segment for the operator (`daily`), an absolute path for admin. */
  readonly path: string;
  readonly label: string;
  /** A shorter label for narrow slots (phone bottom bar, icon rail). */
  readonly short?: string;
  readonly group: string;
  readonly rank: NavRank;
  readonly badge?: boolean;
  readonly testId?: string;
  /** A one-line hint for the palette and sidebar variants. */
  readonly hint: string;
  /** The `proto-icon` glyph for the phone rail and the palette. */
  readonly icon: string;
}

/**
 * The operator console's six sections, in the SHIPPED order (`operator-console.ts` `tabs`), with
 * a grouping and a ranking on top. `b` keeps the order; `c`, `d`, `f` re-order by group/rank. That
 * reordering is a maintainer decision — see VERDICT.md.
 */
export const OPERATOR_NAV: readonly NavItem[] = [
  {
    path: 'beach-map',
    icon: 'beach-map',
    label: 'Beach map',
    group: 'Set-up',
    rank: 'primary',
    hint: 'Lay out sets, pools and aisles',
  },
  {
    path: 'pricing',
    icon: 'pricing',
    label: 'Pricing',
    group: 'Set-up',
    rank: 'secondary',
    hint: 'Per-row prices',
  },
  {
    path: 'daily',
    icon: 'daily',
    label: 'Daily view',
    short: 'Daily',
    group: 'Today',
    rank: 'primary',
    hint: 'Arrivals, walk-ins, sales close',
  },
  {
    path: 'requests',
    icon: 'requests',
    label: 'Requests',
    group: 'Today',
    rank: 'primary',
    badge: true,
    hint: 'Accept or decline booking requests',
  },
  {
    path: 'payouts',
    icon: 'payouts',
    label: 'Payouts',
    group: 'Money',
    rank: 'secondary',
    hint: 'Ledger and statements',
  },
  {
    path: 'venue',
    icon: 'venue',
    label: 'Venue & commodities',
    short: 'Venue',
    group: 'Set-up',
    rank: 'secondary',
    hint: 'Details, amenities, photos',
  },
];

/** Group order for the grouped variants: what the manager does today first, set-up next, money last. */
export const OPERATOR_GROUPS = ['Today', 'Set-up', 'Money'] as const;

/**
 * The admin console's eight shipped tabs. The paths and labels are `admin-console-tabs.ts`'s; the
 * order here is `ADMIN_CONSOLE_TAB_ORDER` (Payouts' reserved slot left empty). `group` and `rank`
 * are NEW: they re-group the written contract, which the grouped/ranked variants (`c`, `d`, `f`)
 * consume — a change to the contract that VERDICT.md names explicitly rather than takes silently.
 */
export const ADMIN_NAV: readonly NavItem[] = [
  {
    path: '/admin',
    icon: 'operators',
    label: 'Operators',
    group: 'Accounts',
    rank: 'primary',
    testId: 'admin-tab-operators',
    hint: 'Approve, suspend, reinstate',
  },
  {
    path: '/admin/commissions',
    icon: 'commissions',
    label: 'Commissions',
    group: 'Money',
    rank: 'secondary',
    testId: 'admin-tab-commissions',
    hint: 'Per-venue rate schedule',
  },
  {
    path: '/admin/email',
    icon: 'email',
    label: 'Email',
    group: 'Outboxes',
    rank: 'primary',
    testId: 'admin-tab-email',
    hint: 'Undelivered mail, resend',
  },
  {
    path: '/admin/refunds',
    icon: 'refunds',
    label: 'Refunds',
    group: 'Outboxes',
    rank: 'primary',
    testId: 'admin-tab-refunds',
    hint: 'Outstanding refunds, re-drive',
  },
  {
    path: '/admin/photos',
    icon: 'photos',
    label: 'Photos',
    group: 'Moderation',
    rank: 'primary',
    testId: 'admin-tab-photos',
    hint: 'Venue photo takedowns',
  },
  {
    path: '/admin/reviews',
    icon: 'reviews',
    label: 'Reviews',
    group: 'Moderation',
    rank: 'primary',
    testId: 'admin-tab-reviews',
    hint: 'Hide or restore a review',
  },
  {
    path: '/admin/privacy',
    icon: 'privacy',
    label: 'Privacy',
    group: 'Records',
    rank: 'secondary',
    testId: 'admin-tab-privacy',
    hint: 'Data-subject erasure',
  },
  {
    path: '/admin/audit',
    icon: 'audit',
    label: 'Audit',
    group: 'Records',
    rank: 'secondary',
    testId: 'admin-tab-audit',
    hint: 'Every admin action, in order',
  },
];

export const ADMIN_GROUPS = ['Accounts', 'Outboxes', 'Moderation', 'Money', 'Records'] as const;

/** Items of one group, in their list order. */
export function inGroup(items: readonly NavItem[], group: string): NavItem[] {
  return items.filter((item) => item.group === group);
}

/** `routerLinkActive` matching by path alone, so `?variant=` never unlights a tab. */
export const EXACT_PATH: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

export const GLASS_BAR =
  'sticky top-0 z-20 border-b border-riv-header-border bg-riv-header-glass backdrop-blur-[22px] backdrop-saturate-[1.7]';

export const BRAND =
  'inline-flex shrink-0 items-center gap-1.5 text-[18px] whitespace-nowrap leading-[1.15] font-bold tracking-[-0.01em] text-riv-ink no-underline';

/** The live Requests count: the one solid-fill element the bar carries, so it outranks every tab. */
export const BADGE =
  'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-riv-solid-fill-brand px-1.5 text-[11.5px] leading-none font-bold text-white';

/**
 * An underlined text tab: full ink when current plus a 3px bar in that ink sitting ON the rail's
 * baseline (`-bottom-px` overlaps the rail's 1px border) — the marker the hard rule asks for, and
 * one no pill has. `inline-flex` so `appTouchTarget`'s floor is live on an `<a>`.
 */
export const RAIL_TAB =
  "relative inline-flex min-h-11 shrink-0 items-center gap-[7px] px-0.5 text-[13.5px] font-semibold whitespace-nowrap text-riv-ink-soft no-underline hover:text-riv-ink after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-current after:opacity-0 after:content-[''] aria-[current=page]:text-riv-ink aria-[current=page]:after:opacity-100";

/** The rail those tabs sit on: one hairline every tab shares, so the underline reads as a marker on
 *  a baseline rather than a decoration under a word. Scrolls sideways with NO edge mask: the cut tab
 *  at the edge is the overflow affordance the pill row could not show. */
export const RAIL =
  'flex w-full flex-nowrap items-stretch gap-5 overflow-x-auto border-b border-riv-header-border scroll-px-6 scroll-smooth scrollbar-none';

export const POP =
  'absolute z-40 animate-[riv-pop_0.2s_ease] rounded-[18px] border border-riv-pop-border bg-riv-pop-surface text-riv-pop-ink shadow-riv-pop backdrop-blur-[28px] backdrop-saturate-[1.8] motion-reduce:animate-none';

export const BACKDROP = 'fixed inset-0 z-30 bg-[rgba(6,30,40,0.2)]';

const CURRENT_POP_ROW =
  'aria-[current=page]:bg-riv-pop-hover aria-[current=page]:text-riv-pop-accent';

export const POP_ITEM = `flex w-full min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-[9px] text-left text-[14px] font-semibold text-riv-pop-ink no-underline [transition:background_0.12s_ease] hover:bg-riv-pop-hover ${CURRENT_POP_ROW}`;

export const POP_BTN = `${POP_ITEM} cursor-pointer`;

/** The glass chip a disclosure trigger wears (account, venue switcher, More). */
export const CHIP_BTN =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-riv-chip-border bg-riv-chip-bg px-3 text-[13.5px] font-semibold text-riv-ink [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none';

export const AVATAR =
  'inline-flex shrink-0 items-center justify-center rounded-full bg-riv-solid-fill-brand font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]';

export function initialOf(name: string | undefined): string {
  const first = name?.trim().charAt(0) ?? '';
  return (first === '' ? '?' : first).toUpperCase();
}

export function handleOf(name: string | undefined): string {
  return name?.split('@')[0] ?? '';
}

/** The item the settled URL points at: the last segment for the console, the whole path for admin. */
export function activeItem(
  items: readonly NavItem[],
  url: string,
  surface: ConsoleSurface,
): NavItem | undefined {
  const path = url.split('?')[0];
  if (surface === 'admin') {
    return items.find((item) => item.path === path);
  }
  const segment = path.split('/').filter(Boolean)[2];
  return items.find((item) => item.path === segment);
}

/** The router link for an item on a surface: console children need the venue id in front. */
export function linkFor(item: NavItem, ctx: ConsoleNavContext): readonly (string | number)[] {
  return ctx.surface === 'admin' ? [item.path] : ['/operator', ctx.venueId ?? 0, item.path];
}

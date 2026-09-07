import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { currentUrl } from '../shared/current-url';
import { TouchTarget } from '../shared/touch-target';
import {
  ADMIN_GROUPS,
  ADMIN_NAV,
  BACKDROP,
  BADGE,
  BRAND,
  ConsoleNavContext,
  EXACT_PATH,
  GLASS_BAR,
  NavItem,
  OPERATOR_GROUPS,
  OPERATOR_NAV,
  POP,
  activeItem,
  inGroup,
  linkFor,
} from './console-nav-support';
import { ProtoAccountMenu } from './proto-account-menu';
import { ProtoVenueSwitch } from './proto-venue-switch';

/** A sidebar row: full-width, a 3px left bar in full ink plus a white fill when current. */
const SIDE_LINK =
  "relative flex min-h-11 items-center gap-2 rounded-[12px] px-3 text-[14px] font-semibold text-riv-ink-soft no-underline [transition:background_0.12s_ease] hover:bg-white/55 hover:text-riv-ink before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-current before:opacity-0 before:content-[''] aria-[current=page]:bg-white aria-[current=page]:text-riv-ink aria-[current=page]:shadow-[0_1px_2px_rgba(7,42,58,0.08)] aria-[current=page]:before:opacity-100";

const GROUP_LABEL =
  'mt-4 mb-1 px-3 text-[10.5px] font-bold tracking-[0.16em] text-riv-ink-faint uppercase first:mt-0';

/** A phone bottom tab: a 3px bar at the top edge and full ink when current (the tourist bar's cue). */
const BOTTOM_TAB =
  "relative flex h-[60px] cursor-pointer flex-col items-center justify-center gap-1 px-1 text-center text-[11px] leading-tight font-semibold text-riv-ink-soft no-underline before:absolute before:top-0 before:h-[3px] before:w-9 before:rounded-b-full before:bg-current before:opacity-0 before:content-[''] aria-[current=page]:text-riv-ink aria-[current=page]:before:opacity-100";

const SHEET_ITEM =
  'flex w-full min-h-11 items-center gap-2 rounded-[14px] px-3.5 py-[11px] text-left text-[15px] font-semibold text-riv-pop-ink no-underline hover:bg-riv-pop-hover aria-[current=page]:bg-riv-pop-hover aria-[current=page]:text-riv-pop-accent';

/**
 * PROTOTYPE variant C — "Sidebar". From `lg` up a 240px left column carries everything: brand, the
 * venue switcher as the first row (invariant #13 — the venue is the first thing you read), the
 * sections grouped under small labels (Today · Set-up · Money; Accounts · Outboxes · Moderation ·
 * Money · Records), the cross-link between the two consoles, and the account at the foot. Nine
 * admin destinations stop being nine equal pills and become five labelled groups. Below `lg` the
 * column folds into a top bar plus a bottom tab bar of the primaries and a current-aware More.
 *
 * <p>The cost is width: 240px off the one page whose content is a horizontal grid (the beach map).
 * The layout editor's own 280px tool rail already sits beside the grid from `lg`; the screenshots
 * show whether the two rails leave the grid enough room.
 */
@Component({
  selector: 'app-console-nav-c',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    TouchTarget,
    ProtoAccountMenu,
    ProtoVenueSwitch,
  ],
  host: {
    class: 'flex min-h-screen max-lg:pb-[calc(61px+env(safe-area-inset-bottom))]',
    '(document:keydown.escape)': 'sheetOpen.set(false)',
  },
  template: `
    <aside
      class="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-riv-header-border bg-riv-header-glass backdrop-blur-[22px] backdrop-saturate-[1.7] lg:flex"
      aria-label="Console"
      data-testid="proto-sidebar"
    >
      <a appTouchTarget routerLink="/operator" [class]="brand + ' px-5 pt-4 pb-2'"
        >Riviera <span class="font-medium text-riv-ink-soft">Operator</span></a
      >
      @if (ctx().surface === 'operator') {
        <div class="px-3 pt-1 pb-2">
          <app-proto-venue-switch
            emphasis="row"
            [venueId]="ctx().venueId"
            [venueName]="ctx().venueName"
            [section]="active()?.path ?? 'beach-map'"
          />
        </div>
      } @else if (ctx().surface === 'admin') {
        <p class="px-5 pt-1 pb-2 text-[15px] font-bold tracking-[-0.01em] text-riv-ink">
          Admin console
        </p>
      }
      <nav class="flex-1 overflow-y-auto px-3 py-2" [attr.aria-label]="navLabel()">
        @if (ctx().surface === 'plain' && operator.signedIn()) {
          <p [class]="groupLabel">Your venues</p>
          @for (venue of owned.venues() ?? []; track venue.id) {
            <a appTouchTarget [routerLink]="['/operator', venue.id]" [class]="sideLink">{{
              venue.name
            }}</a>
          }
          <a
            appTouchTarget
            routerLink="/operator"
            [queryParams]="{ create: '1' }"
            [class]="sideLink + ' text-riv-ink-faint'"
            >+ Add a venue</a
          >
        }
        @for (group of groups(); track group) {
          <p [class]="groupLabel">{{ group }}</p>
          @for (item of inGroup(group); track item.path) {
            <a
              appTouchTarget
              [routerLink]="link(item)"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="sideLink"
              [attr.data-testid]="item.testId"
            >
              <span class="flex-1">{{ item.label }}</span>
              @if (item.badge && ctx().requestsCount > 0) {
                <span [class]="badge">{{ ctx().requestsCount }}</span>
              }
            </a>
          }
        }
        @if (ctx().surface !== 'admin' && operator.isAdmin()) {
          <p [class]="groupLabel">Platform</p>
          <a appTouchTarget routerLink="/admin" [class]="sideLink">Admin console</a>
        }
        @if (ctx().surface === 'admin') {
          <p [class]="groupLabel">Operator</p>
          <a appTouchTarget routerLink="/operator" [class]="sideLink">Your venues</a>
        }
      </nav>
      <div class="border-t border-riv-header-border px-3 py-3">
        <app-proto-account-menu placement="up" [showAdmin]="false" (signOut)="signOut.emit()" />
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header [class]="bar + ' lg:hidden'" data-testid="proto-bar">
        <div class="flex items-center justify-between gap-3 px-4 py-2">
          <div class="flex min-w-0 items-center gap-2">
            <a appTouchTarget routerLink="/operator" [class]="brand">Riviera</a>
            @if (ctx().surface === 'operator') {
              <app-proto-venue-switch
                [venueId]="ctx().venueId"
                [venueName]="ctx().venueName"
                [section]="active()?.path ?? 'beach-map'"
              />
            } @else if (ctx().surface === 'admin') {
              <span class="text-[15px] font-bold text-riv-ink">Admin</span>
            }
          </div>
          <app-proto-account-menu [compact]="true" (signOut)="signOut.emit()" />
        </div>
      </header>
      <ng-container *ngTemplateOutlet="lead()" />
      <ng-container *ngTemplateOutlet="body()" />
    </div>

    @if (items().length > 0) {
      <nav
        class="fixed inset-x-0 bottom-0 z-20 grid border-t border-riv-header-border bg-riv-tabbar-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-[22px] backdrop-saturate-[1.7] lg:hidden"
        [style.grid-template-columns]="'repeat(' + (primaries().length + 1) + ', minmax(0, 1fr))'"
        [attr.aria-label]="navLabel() + ' (phone)'"
        data-testid="proto-bottom-bar"
      >
        @for (item of primaries(); track item.path) {
          <a
            appTouchTarget
            [routerLink]="link(item)"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="exactPath"
            [class]="bottomTab"
          >
            <span>{{ item.short ?? item.label }}</span>
            @if (item.badge && ctx().requestsCount > 0) {
              <span [class]="badge + ' absolute top-2 right-[calc(50%-30px)]'">{{
                ctx().requestsCount
              }}</span>
            }
          </a>
        }
        <button
          appTouchTarget
          type="button"
          [class]="bottomTab + ' cursor-pointer'"
          [attr.aria-current]="moreActive() ? 'page' : null"
          [attr.aria-expanded]="sheetOpen()"
          (click)="sheetOpen.set(!sheetOpen())"
        >
          <span>{{ moreActive()?.short ?? moreActive()?.label ?? 'More' }}</span>
          <span class="text-[9px]" aria-hidden="true">&#9650;</span>
        </button>
      </nav>
      @if (sheetOpen()) {
        <div
          [class]="backdrop + ' lg:hidden'"
          (click)="sheetOpen.set(false)"
          aria-hidden="true"
        ></div>
        <div [class]="sheet" data-testid="proto-more-sheet">
          @for (group of groups(); track group) {
            @if (secondariesIn(group).length > 0) {
              <p [class]="groupLabel + ' text-riv-pop-ink-soft'">{{ group }}</p>
              @for (item of secondariesIn(group); track item.path) {
                <a
                  appTouchTarget
                  [routerLink]="link(item)"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                  [routerLinkActiveOptions]="exactPath"
                  [class]="sheetItem"
                  (click)="sheetOpen.set(false)"
                  >{{ item.label }}</a
                >
              }
            }
          }
          @if (ctx().surface !== 'admin' && operator.isAdmin()) {
            <a appTouchTarget routerLink="/admin" [class]="sheetItem" (click)="sheetOpen.set(false)"
              >Admin console</a
            >
          }
          @if (ctx().surface === 'admin') {
            <a
              appTouchTarget
              routerLink="/operator"
              [class]="sheetItem"
              (click)="sheetOpen.set(false)"
              >Your venues</a
            >
          }
        </div>
      }
    }
  `,
})
export class ConsoleNavC {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly lead = input<TemplateRef<unknown> | null>(null);
  readonly body = input<TemplateRef<unknown> | null>(null);
  readonly signOut = output<void>();

  protected readonly operator = inject(OperatorAuth);
  protected readonly owned = inject(OwnedVenues);
  private readonly router = inject(Router);
  private readonly url = currentUrl(this.router);

  protected readonly bar = GLASS_BAR;
  protected readonly brand = BRAND;
  protected readonly badge = BADGE;
  protected readonly sideLink = SIDE_LINK;
  protected readonly groupLabel = GROUP_LABEL;
  protected readonly bottomTab = BOTTOM_TAB;
  protected readonly sheetItem = SHEET_ITEM;
  protected readonly backdrop = BACKDROP;
  protected readonly sheet = `fixed inset-x-2.5 bottom-[calc(72px+env(safe-area-inset-bottom))] p-2.5 lg:hidden ${POP}`;
  protected readonly exactPath = EXACT_PATH;
  protected readonly sheetOpen = signal(false);

  protected readonly items = computed((): readonly NavItem[] => {
    const ctx = this.ctx();
    if (ctx.surface === 'operator') {
      return OPERATOR_NAV;
    }
    return ctx.surface === 'admin' && !ctx.navHidden ? ADMIN_NAV : [];
  });
  protected readonly groups = computed((): readonly string[] => {
    const groups = this.ctx().surface === 'admin' ? ADMIN_GROUPS : OPERATOR_GROUPS;
    return groups.filter((group) => inGroup(this.items(), group).length > 0);
  });
  protected readonly navLabel = computed(() =>
    this.ctx().surface === 'admin' ? 'Admin console sections' : 'Operator console sections',
  );
  protected readonly active = computed(() =>
    activeItem(this.items(), this.url(), this.ctx().surface),
  );
  /** The bottom bar's own slots: the first four primaries in group order; the rest sit in More. */
  protected readonly primaries = computed(() =>
    this.groups()
      .flatMap((group) => this.inGroup(group))
      .filter((item) => item.rank === 'primary')
      .slice(0, 4),
  );
  protected readonly moreActive = computed(() => {
    const active = this.active();
    return active && !this.primaries().includes(active) ? active : undefined;
  });

  protected inGroup(group: string): NavItem[] {
    return inGroup(this.items(), group);
  }

  protected secondariesIn(group: string): NavItem[] {
    return this.inGroup(group).filter((item) => !this.primaries().includes(item));
  }

  protected link(item: NavItem): readonly (string | number)[] {
    return linkFor(item, this.ctx());
  }
}

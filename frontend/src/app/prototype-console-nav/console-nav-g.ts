import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
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
  RAIL_TAB,
  activeItem,
  inGroup,
  linkFor,
} from './console-nav-support';
import { ProtoAccountMenu } from './proto-account-menu';
import { ProtoIcon } from './proto-icon';
import { ProtoPalette } from './proto-palette';
import { ProtoVenueSwitch } from './proto-venue-switch';

/** A section slot on the top row: the same underline marker as a tab, one level up. */
const SECTION =
  "relative flex min-h-11 items-center after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-current after:opacity-0 after:content-[''] data-[current]:text-riv-ink data-[current]:after:opacity-100";

/** A phone tab: glyph over an 11px label, the underline on the rail's hairline when current. */
const PHONE_TAB =
  "relative flex min-h-[58px] cursor-pointer flex-col items-center justify-center gap-1 px-1 text-center text-[11px] leading-tight font-semibold text-riv-ink-soft no-underline after:absolute after:inset-x-2 after:-bottom-px after:h-[3px] after:rounded-full after:bg-current after:opacity-0 after:content-[''] aria-[current=page]:text-riv-ink aria-[current=page]:after:opacity-100 [&_svg]:size-[21px]";

const SHEET_ITEM =
  'flex w-full min-h-11 items-center gap-3 rounded-[14px] px-3.5 py-[11px] text-left text-[15px] font-semibold text-riv-pop-ink no-underline hover:bg-riv-pop-hover aria-[current=page]:bg-riv-pop-hover aria-[current=page]:text-riv-pop-accent [&_svg]:size-[18px] [&_svg]:shrink-0';

const GROUP_LABEL =
  'mt-3 mb-1 px-3.5 text-[10.5px] font-bold tracking-[0.16em] text-riv-pop-ink-soft uppercase first:mt-0';

/**
 * PROTOTYPE variant G — D as the grill answered it (VERDICT.md, the decisions register):
 *
 * <ul>
 *   <li>one shell for every operator and admin route; only the section row is sticky, and below
 *       `sm` it slides away on scroll-down and returns on scroll-up; the rail scrolls with the page,
 *       the stats strip under it;</li>
 *   <li>Today-first operator order and the regrouped admin order, hairline dividers at the groups;</li>
 *   <li>below `sm`, glyph-over-label tabs: three primaries plus a `More` that carries the current
 *       child's glyph, label and `aria-current` — measured at 344px (Galaxy Fold); the `Admin`
 *       section link and the ⌘K button leave the row there, and the More sheet carries the
 *       cross-console row instead;</li>
 *   <li>a ⌘K palette behind a search glyph in the row;</li>
 *   <li>the console's own two-way theme, porcelain or dark, in the account chip;</li>
 *   <li>the venue switcher as drawn; `Add another venue` lives only there; the chip holds Signed in
 *       as · Change password · Sign out.</li>
 * </ul>
 */
@Component({
  selector: 'app-console-nav-g',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    TouchTarget,
    ProtoAccountMenu,
    ProtoVenueSwitch,
    ProtoIcon,
    ProtoPalette,
  ],
  host: {
    class: 'flex min-h-screen flex-col',
    '(window:scroll)': 'onScroll()',
    '(document:keydown.escape)': 'sheetOpen.set(false)',
  },
  template: `
    <header
      [class]="bar + ' [transition:transform_0.2s_ease] motion-reduce:transition-none'"
      [class.max-sm:-translate-y-full]="hidden()"
      data-testid="proto-bar"
    >
      <div
        class="mx-auto flex min-w-0 max-w-[1120px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-5">
          <a appTouchTarget routerLink="/operator" [class]="brand" data-testid="proto-brand"
            >Riviera</a
          >
          <nav class="flex min-w-0 items-stretch gap-2 sm:gap-5" aria-label="Sections">
            <div [class]="section" [attr.data-current]="ctx().surface === 'operator' ? '' : null">
              <app-proto-venue-switch
                [venueId]="ctx().venueId"
                [venueName]="ctx().venueName"
                [section]="active()?.path ?? 'daily'"
              />
            </div>
            @if (operator.isAdmin()) {
              <a
                appTouchTarget
                routerLink="/admin"
                [class]="
                  section +
                  ' px-0.5 text-[13.5px] font-semibold text-riv-ink-soft no-underline hover:text-riv-ink max-sm:hidden'
                "
                [attr.data-current]="ctx().surface === 'admin' ? '' : null"
                [attr.aria-current]="ctx().surface === 'admin' ? 'page' : null"
                >Admin</a
              >
            }
          </nav>
        </div>
        <div class="flex shrink-0 items-center gap-1 sm:gap-2">
          @if (operator.signedIn()) {
            <button
              appTouchTarget
              type="button"
              class="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-2 text-riv-ink-soft hover:bg-white/40 hover:text-riv-ink max-sm:hidden [&_svg]:size-[18px]"
              aria-label="Jump to a section or venue (⌘K)"
              [attr.aria-expanded]="palette()?.open() ?? false"
              data-testid="proto-title"
              (click)="palette()?.toggle()"
            >
              <app-proto-icon name="search" />
              <kbd
                class="hidden rounded-md border border-riv-chip-border px-1.5 py-0.5 font-mono text-[11px] font-semibold sm:inline"
                >⌘K</kbd
              >
            </button>
          }
          <app-proto-account-menu
            [showAdmin]="false"
            [minimal]="true"
            [themeSwitch]="true"
            (signOut)="signOut.emit()"
          />
        </div>
      </div>
    </header>

    @if (items().length > 0) {
      <div class="mx-auto w-full max-w-[1120px] px-6 pt-2 max-sm:hidden">
        <nav
          class="flex w-full flex-nowrap items-stretch gap-4 overflow-x-auto border-b border-riv-header-border scroll-px-6 scroll-smooth scrollbar-none"
          [attr.aria-label]="navLabel()"
          data-testid="proto-rail"
        >
          @for (group of groups(); track group; let first = $first) {
            @if (!first) {
              <span class="my-3.5 w-px shrink-0 bg-riv-ink-faint" aria-hidden="true"></span>
            }
            @for (item of inGroup(group); track item.path) {
              <a
                #tabLink
                appTouchTarget
                [routerLink]="link(item)"
                routerLinkActive
                ariaCurrentWhenActive="page"
                [routerLinkActiveOptions]="exactPath"
                [class]="railTab"
                [attr.data-testid]="item.testId"
              >
                {{ item.label }}
                @if (item.badge && ctx().requestsCount > 0) {
                  <span [class]="badge">{{ ctx().requestsCount }}</span>
                }
              </a>
            }
          }
        </nav>
      </div>

      <nav
        class="grid grid-cols-4 border-b border-riv-header-border bg-riv-header-glass px-1 sm:hidden"
        [attr.aria-label]="navLabel() + ' (phone)'"
        data-testid="proto-phone-rail"
      >
        @for (item of primaries(); track item.path) {
          <a
            appTouchTarget
            [routerLink]="link(item)"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="exactPath"
            [class]="phoneTab"
          >
            <app-proto-icon [name]="item.icon" />
            <span>{{ item.short ?? item.label }}</span>
            @if (item.badge && ctx().requestsCount > 0) {
              <span [class]="badge + ' absolute top-1.5 right-[calc(50%-26px)]'">{{
                ctx().requestsCount
              }}</span>
            }
          </a>
        }
        <button
          appTouchTarget
          type="button"
          [class]="phoneTab"
          [attr.aria-current]="moreActive() ? 'page' : null"
          [attr.aria-expanded]="sheetOpen()"
          aria-haspopup="true"
          data-testid="proto-more"
          (click)="sheetOpen.set(!sheetOpen())"
        >
          <app-proto-icon [name]="moreActive()?.icon ?? 'more'" />
          <span>{{ moreActive()?.short ?? moreActive()?.label ?? 'More' }}</span>
        </button>
      </nav>
      @if (sheetOpen()) {
        <div
          [class]="backdrop + ' sm:hidden'"
          (click)="sheetOpen.set(false)"
          aria-hidden="true"
        ></div>
        <div [class]="sheet" data-testid="proto-more-sheet">
          @for (group of groups(); track group) {
            @if (secondariesIn(group).length > 0) {
              <p [class]="groupLabel">{{ group }}</p>
              @for (item of secondariesIn(group); track item.path) {
                <a
                  appTouchTarget
                  [routerLink]="link(item)"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                  [routerLinkActiveOptions]="exactPath"
                  [class]="sheetItem"
                  (click)="sheetOpen.set(false)"
                >
                  <app-proto-icon [name]="item.icon" />
                  <span class="flex min-w-0 flex-1 flex-col leading-tight">
                    <span>{{ item.label }}</span>
                    <span class="text-[12px] font-medium text-riv-pop-ink-soft">{{
                      item.hint
                    }}</span>
                  </span>
                </a>
              }
            }
          }
          @if (ctx().surface !== 'admin' && operator.isAdmin()) {
            <p [class]="groupLabel">Platform</p>
            <a
              appTouchTarget
              routerLink="/admin"
              [class]="sheetItem"
              (click)="sheetOpen.set(false)"
            >
              <app-proto-icon name="admin" />
              <span>Admin console</span>
            </a>
          }
          @if (ctx().surface === 'admin') {
            <p [class]="groupLabel">Operator</p>
            <a
              appTouchTarget
              routerLink="/operator"
              [class]="sheetItem"
              (click)="sheetOpen.set(false)"
            >
              <app-proto-icon name="venues" />
              <span>Your venues</span>
            </a>
          }
        </div>
      }
    }

    <ng-container *ngTemplateOutlet="lead()" />
    <ng-container *ngTemplateOutlet="body()" />

    <app-proto-palette #jump [ctx]="ctx()" [items]="items()" />
  `,
})
export class ConsoleNavG {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly lead = input<TemplateRef<unknown> | null>(null);
  readonly body = input<TemplateRef<unknown> | null>(null);
  readonly signOut = output<void>();

  protected readonly operator = inject(OperatorAuth);
  private readonly router = inject(Router);
  private readonly url = currentUrl(this.router);
  private readonly tabLinks = viewChildren<ElementRef<HTMLAnchorElement>>('tabLink');
  protected readonly palette = viewChild(ProtoPalette);

  protected readonly bar = GLASS_BAR;
  protected readonly brand = BRAND;
  protected readonly badge = BADGE;
  protected readonly section = SECTION;
  protected readonly railTab = RAIL_TAB;
  protected readonly phoneTab = PHONE_TAB;
  protected readonly sheetItem = SHEET_ITEM;
  protected readonly groupLabel = GROUP_LABEL;
  protected readonly backdrop = BACKDROP;
  protected readonly sheet = `fixed inset-x-2.5 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 p-2.5 sm:hidden ${POP}`;
  protected readonly exactPath = EXACT_PATH;
  protected readonly sheetOpen = signal(false);
  /** The section row slides away on scroll-down below `sm`, back on scroll-up. */
  protected readonly hidden = signal(false);
  private lastY = 0;

  protected readonly items = computed((): readonly NavItem[] => {
    const ctx = this.ctx();
    if (ctx.surface === 'operator') {
      return OPERATOR_NAV;
    }
    return ctx.surface === 'admin' && !ctx.navHidden ? ADMIN_NAV : [];
  });
  protected readonly groups = computed((): readonly string[] =>
    this.ctx().surface === 'admin' ? ADMIN_GROUPS : OPERATOR_GROUPS,
  );
  protected readonly navLabel = computed(() =>
    this.ctx().surface === 'admin' ? 'Admin console sections' : 'Operator console sections',
  );
  protected readonly active = computed(() =>
    activeItem(this.items(), this.url(), this.ctx().surface),
  );
  /** The phone rail's three slots: the first three primaries in group order. */
  protected readonly primaries = computed(() =>
    this.groups()
      .flatMap((group) => this.inGroup(group))
      .filter((item) => item.rank === 'primary')
      .slice(0, 3),
  );
  protected readonly moreActive = computed(() => {
    const active = this.active();
    return active && !this.primaries().includes(active) ? active : undefined;
  });

  constructor() {
    effect(() => {
      const active = this.active();
      const ordered = this.groups().flatMap((group) => this.inGroup(group));
      const index = ordered.findIndex((item) => item === active);
      this.tabLinks()[index]?.nativeElement.scrollIntoView?.({
        inline: 'nearest',
        block: 'nearest',
      });
    });
  }

  protected onScroll(): void {
    const y = window.scrollY;
    this.hidden.set(y > this.lastY && y > 64);
    this.lastY = y;
  }

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

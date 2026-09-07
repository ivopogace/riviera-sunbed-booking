import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

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
  POP_ITEM,
  RAIL_TAB,
  activeItem,
  inGroup,
  linkFor,
} from './console-nav-support';
import { ProtoAccountMenu } from './proto-account-menu';
import { ProtoVenueSwitch } from './proto-venue-switch';

/**
 * PROTOTYPE variant F — "Ranked rail". The same underlined rail as B, but the destinations are no
 * longer peers: the primaries (what a manager opens daily — Daily view, Requests, Beach map;
 * Operators, Email, Refunds, Photos, Reviews) sit on the rail in full, and the secondaries
 * (Pricing, Venue, Payouts; Commissions, Privacy, Audit) fold under a `More` item that is itself a
 * rail tab. #710 rejected an overflow menu because it strands `aria-current` inside a closed menu;
 * here the trigger carries `aria-current` and the current child's label (`More · Audit`) whenever
 * the current page is inside it, so nothing is stranded and the rail never overflows.
 */
@Component({
  selector: 'app-console-nav-f',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    TouchTarget,
    ProtoAccountMenu,
    ProtoVenueSwitch,
  ],
  host: { class: 'flex min-h-screen flex-col', '(document:keydown.escape)': 'moreOpen.set(false)' },
  template: `
    <header [class]="bar" data-testid="proto-bar">
      <div class="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <a appTouchTarget routerLink="/operator" [class]="brand"
            >Riviera <span class="font-medium text-riv-ink-soft max-sm:hidden">Operator</span></a
          >
          @if (ctx().surface === 'operator') {
            <span class="h-5 w-px bg-riv-header-border" aria-hidden="true"></span>
            <app-proto-venue-switch
              emphasis="title"
              [venueId]="ctx().venueId"
              [venueName]="ctx().venueName"
              [section]="active()?.path ?? 'beach-map'"
            />
          } @else if (ctx().surface === 'admin') {
            <span class="h-5 w-px bg-riv-header-border" aria-hidden="true"></span>
            <span class="text-[15px] font-bold tracking-[-0.01em] text-riv-ink">Admin</span>
          }
        </div>
        <app-proto-account-menu (signOut)="signOut.emit()" />
      </div>
    </header>

    <ng-container *ngTemplateOutlet="lead()" />

    @if (items().length > 0) {
      <div class="relative mx-auto w-full max-w-[1120px] px-4 pt-2 sm:px-6">
        <nav [class]="rail" [attr.aria-label]="navLabel()" data-testid="proto-rail">
          @for (tab of primaries(); track tab.path) {
            <a
              appTouchTarget
              [routerLink]="link(tab)"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="railTab"
              [attr.data-testid]="tab.testId"
            >
              {{ tab.label }}
              @if (tab.badge && ctx().requestsCount > 0) {
                <span [class]="badge">{{ ctx().requestsCount }}</span>
              }
            </a>
          }
          <div class="relative ml-auto flex items-stretch">
            <button
              appTouchTarget
              type="button"
              [class]="railTab + ' cursor-pointer'"
              [attr.aria-current]="moreActive() ? 'page' : null"
              [attr.aria-expanded]="moreOpen()"
              aria-haspopup="true"
              data-testid="proto-more"
              (click)="moreOpen.set(!moreOpen())"
            >
              @if (moreActive(); as item) {
                <span class="text-riv-ink-soft">More ·</span> {{ item.label }}
              } @else {
                More
              }
              <span class="text-[9px] opacity-85" aria-hidden="true">&#9662;</span>
            </button>
            @if (moreOpen()) {
              <div [class]="backdrop" (click)="moreOpen.set(false)" aria-hidden="true"></div>
              <div [class]="pop" data-testid="proto-more-menu">
                @for (group of groups(); track group) {
                  @for (item of secondariesIn(group); track item.path) {
                    <a
                      appTouchTarget
                      [routerLink]="link(item)"
                      routerLinkActive
                      ariaCurrentWhenActive="page"
                      [routerLinkActiveOptions]="exactPath"
                      [class]="popItem"
                      [attr.data-testid]="item.testId"
                      (click)="moreOpen.set(false)"
                    >
                      <span class="flex min-w-0 flex-1 flex-col leading-tight">
                        <span>{{ item.label }}</span>
                        <span class="text-[12px] font-medium text-riv-pop-ink-soft">{{
                          item.hint
                        }}</span>
                      </span>
                    </a>
                  }
                }
              </div>
            }
          </div>
        </nav>
      </div>
    }

    <ng-container *ngTemplateOutlet="body()" />
  `,
})
export class ConsoleNavF {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly lead = input<TemplateRef<unknown> | null>(null);
  readonly body = input<TemplateRef<unknown> | null>(null);
  readonly signOut = output<void>();

  private readonly router = inject(Router);
  private readonly url = currentUrl(this.router);

  protected readonly bar = GLASS_BAR;
  protected readonly brand = BRAND;
  protected readonly rail =
    'flex w-full flex-nowrap items-stretch gap-5 border-b border-riv-header-border';
  protected readonly railTab = RAIL_TAB;
  protected readonly badge = BADGE;
  protected readonly backdrop = BACKDROP;
  protected readonly popItem = POP_ITEM;
  protected readonly pop = `top-[calc(100%+6px)] right-0 w-[272px] p-[7px] ${POP}`;
  protected readonly exactPath = EXACT_PATH;
  protected readonly moreOpen = signal(false);

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
  protected readonly primaries = computed(() =>
    this.groups()
      .flatMap((group) => inGroup(this.items(), group))
      .filter((item) => item.rank === 'primary'),
  );
  protected readonly moreActive = computed(() => {
    const active = this.active();
    return active?.rank === 'secondary' ? active : undefined;
  });

  protected secondariesIn(group: string): NavItem[] {
    return inGroup(this.items(), group).filter((item) => item.rank === 'secondary');
  }

  protected link(item: NavItem): readonly (string | number)[] {
    return linkFor(item, this.ctx());
  }
}

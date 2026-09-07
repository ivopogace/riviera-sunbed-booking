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
  viewChildren,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { currentUrl } from '../shared/current-url';
import { TouchTarget } from '../shared/touch-target';
import {
  ADMIN_GROUPS,
  ADMIN_NAV,
  BADGE,
  BRAND,
  ConsoleNavContext,
  EXACT_PATH,
  GLASS_BAR,
  NavItem,
  OPERATOR_GROUPS,
  OPERATOR_NAV,
  RAIL_TAB,
  activeItem,
  inGroup,
  linkFor,
} from './console-nav-support';
import { ProtoAccountMenu } from './proto-account-menu';
import { ProtoVenueSwitch } from './proto-venue-switch';

/** A section slot on the top row: the same underline marker as a tab, one level up. */
const SECTION =
  "relative flex min-h-11 items-center after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:rounded-full after:bg-current after:opacity-0 after:content-[''] data-[current]:text-riv-ink data-[current]:after:opacity-100";

/**
 * PROTOTYPE variant D — "One shell". The two chromes become one component that every operator and
 * admin route wears. Row 1 is the SECTION level: brand, the venue switcher (which is itself the
 * "Venue console" section — current on `/operator/:id/*`, and the answer to how a multi-venue
 * operator switches), `Admin` for admins, and the account chip. Row 2 is the TAB level: the section's
 * own rail, underlined text tabs in group order with hairline dividers between groups — so the
 * nine admin destinations read as five small clusters, not nine peers. Both rows are sticky; the
 * stats strip sits below them as page content.
 *
 * <p>Same component on the `/operator` landing and the password page: row 1 only, with the venue
 * chip offering the owned list, so no operator page dead-ends.
 */
@Component({
  selector: 'app-console-nav-d',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    TouchTarget,
    ProtoAccountMenu,
    ProtoVenueSwitch,
  ],
  host: { class: 'flex min-h-screen flex-col' },
  template: `
    <header [class]="bar" data-testid="proto-bar">
      <div class="mx-auto max-w-[1120px] px-4 sm:px-6">
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
            <a appTouchTarget routerLink="/operator" [class]="brand" data-testid="proto-brand"
              >Riviera</a
            >
            <nav class="flex min-w-0 items-stretch gap-3 sm:gap-5" aria-label="Sections">
              <div [class]="section" [attr.data-current]="ctx().surface === 'operator' ? '' : null">
                <app-proto-venue-switch
                  [venueId]="ctx().venueId"
                  [venueName]="ctx().venueName"
                  [section]="active()?.path ?? 'beach-map'"
                />
              </div>
              @if (operator.isAdmin()) {
                <a
                  appTouchTarget
                  routerLink="/admin"
                  [class]="
                    section +
                    ' px-0.5 text-[13.5px] font-semibold text-riv-ink-soft no-underline hover:text-riv-ink'
                  "
                  [attr.data-current]="ctx().surface === 'admin' ? '' : null"
                  [attr.aria-current]="ctx().surface === 'admin' ? 'page' : null"
                  >Admin</a
                >
              }
            </nav>
          </div>
          <app-proto-account-menu [showAdmin]="false" (signOut)="signOut.emit()" />
        </div>
        @if (items().length > 0) {
          <nav
            class="-mx-4 flex flex-nowrap items-stretch gap-4 overflow-x-auto border-t border-riv-header-border px-4 scroll-px-4 scroll-smooth scrollbar-none sm:mx-0 sm:px-0 sm:scroll-px-0"
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
        }
      </div>
    </header>

    <ng-container *ngTemplateOutlet="lead()" />
    <ng-container *ngTemplateOutlet="body()" />
  `,
})
export class ConsoleNavD {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly lead = input<TemplateRef<unknown> | null>(null);
  readonly body = input<TemplateRef<unknown> | null>(null);
  readonly signOut = output<void>();

  protected readonly operator = inject(OperatorAuth);
  private readonly router = inject(Router);
  private readonly url = currentUrl(this.router);
  private readonly tabLinks = viewChildren<ElementRef<HTMLAnchorElement>>('tabLink');

  protected readonly bar = GLASS_BAR;
  protected readonly brand = BRAND;
  protected readonly badge = BADGE;
  protected readonly section = SECTION;
  protected readonly railTab = RAIL_TAB;
  protected readonly exactPath = EXACT_PATH;

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

  protected inGroup(group: string): NavItem[] {
    return inGroup(this.items(), group);
  }

  protected link(item: NavItem): readonly (string | number)[] {
    return linkFor(item, this.ctx());
  }
}

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

import { currentUrl } from '../shared/current-url';
import { TouchTarget } from '../shared/touch-target';
import {
  ADMIN_NAV,
  BADGE,
  BRAND,
  ConsoleNavContext,
  EXACT_PATH,
  GLASS_BAR,
  OPERATOR_NAV,
  RAIL,
  RAIL_TAB,
  activeItem,
  linkFor,
} from './console-nav-support';
import { ProtoAccountMenu } from './proto-account-menu';

/**
 * PROTOTYPE variant B — "Tab rail". The smallest structural change: today's two chromes stay two,
 * the stats strip stays where it is, but the pill row becomes a true tab rail — text tabs on one
 * shared hairline, the current one in full ink with a 3px underline sitting on that hairline (the
 * tourist header's own marker, H). The rail scrolls with no edge mask, so a cut-off tab IS the
 * overflow cue. The five right-side peers of the bar collapse into one account chip.
 *
 * <p>What it does not change: the tab order (shipped), the venue title as a label (no switcher —
 * `proto-venue-switch` renders plain text when it has nothing to switch to, but here it is not
 * asked at all), the separate admin chrome under its own bar.
 */
@Component({
  selector: 'app-console-nav-b',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, TouchTarget, ProtoAccountMenu],
  host: { class: 'flex min-h-screen flex-col' },
  template: `
    <header [class]="bar" data-testid="proto-bar">
      <div class="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-6 py-2">
        <div class="flex min-w-0 items-center gap-3">
          <a appTouchTarget routerLink="/operator" [class]="brand"
            >Riviera <span class="font-medium text-riv-ink-soft max-sm:hidden">Operator</span></a
          >
          @if (ctx().surface === 'operator') {
            <span class="h-5 w-px bg-riv-header-border" aria-hidden="true"></span>
            <span class="min-w-0 truncate text-[15px] font-bold tracking-[-0.01em] text-riv-ink">{{
              ctx().venueName ?? 'Your venue'
            }}</span>
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
      <div class="mx-auto w-full max-w-[1120px] px-6 pt-2">
        <nav [class]="rail" [attr.aria-label]="navLabel()" data-testid="proto-rail">
          @for (tab of items(); track tab.path) {
            <a
              #tabLink
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
        </nav>
      </div>
    }

    <ng-container *ngTemplateOutlet="body()" />
  `,
})
export class ConsoleNavB {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly lead = input<TemplateRef<unknown> | null>(null);
  readonly body = input<TemplateRef<unknown> | null>(null);
  readonly signOut = output<void>();

  protected readonly bar = GLASS_BAR;
  protected readonly brand = BRAND;
  protected readonly rail = RAIL;
  protected readonly railTab = RAIL_TAB;
  protected readonly badge = BADGE;
  protected readonly exactPath = EXACT_PATH;

  private readonly router = inject(Router);
  private readonly url = currentUrl(this.router);
  private readonly tabLinks = viewChildren<ElementRef<HTMLAnchorElement>>('tabLink');

  protected readonly items = computed(() => {
    const ctx = this.ctx();
    if (ctx.surface === 'operator') {
      return OPERATOR_NAV;
    }
    return ctx.surface === 'admin' && !ctx.navHidden ? ADMIN_NAV : [];
  });
  protected readonly navLabel = computed(() =>
    this.ctx().surface === 'admin' ? 'Admin console sections' : 'Operator console sections',
  );

  constructor() {
    effect(() => {
      const active = activeItem(this.items(), this.url(), this.ctx().surface);
      const index = this.items().findIndex((item) => item === active);
      this.tabLinks()[index]?.nativeElement.scrollIntoView?.({
        inline: 'nearest',
        block: 'nearest',
      });
    });
  }

  protected link(item: (typeof OPERATOR_NAV)[number]): readonly (string | number)[] {
    return linkFor(item, this.ctx());
  }
}

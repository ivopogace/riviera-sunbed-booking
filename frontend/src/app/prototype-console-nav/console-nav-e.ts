import { NgTemplateOutlet } from '@angular/common';
import { Component, TemplateRef, computed, inject, input, output, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { currentUrl } from '../shared/current-url';
import { TouchTarget } from '../shared/touch-target';
import {
  ADMIN_NAV,
  BADGE,
  BRAND,
  ConsoleNavContext,
  GLASS_BAR,
  NavItem,
  OPERATOR_NAV,
  activeItem,
} from './console-nav-support';
import { ProtoAccountMenu } from './proto-account-menu';
import { ProtoPalette } from './proto-palette';

/**
 * PROTOTYPE variant E — "Palette". No strip at all: the bar reads as a path — brand / venue / the
 * current page's title — and the title is a button that opens a searchable list of everything
 * reachable (`proto-palette.ts`), also on ⌘K / Ctrl-K. The one destination that keeps a
 * permanent slot in the bar is Requests when it has a count — the time-critical queue must not be
 * a keystroke away.
 *
 * <p>The question it asks: at nine admin destinations, is a list you search better than a row you
 * scan? The screenshots answer for discoverability: nothing on the page says what else exists.
 */
@Component({
  selector: 'app-console-nav-e',
  imports: [NgTemplateOutlet, RouterLink, TouchTarget, ProtoAccountMenu, ProtoPalette],
  host: { class: 'flex min-h-screen flex-col' },
  template: `
    <header [class]="bar" data-testid="proto-bar">
      <div class="mx-auto flex max-w-[1120px] items-center gap-2 px-4 py-2 sm:px-6">
        <a appTouchTarget routerLink="/operator" [class]="brand">Riviera</a>
        @if (ctx().surface === 'operator') {
          <span class="hidden text-[15px] text-riv-ink-faint sm:inline" aria-hidden="true">/</span>
          <span class="hidden truncate text-[13.5px] font-semibold text-riv-ink-soft sm:inline">{{
            ctx().venueName ?? 'Your venue'
          }}</span>
        } @else if (ctx().surface === 'admin') {
          <span class="text-[15px] text-riv-ink-faint" aria-hidden="true">/</span>
          <span class="text-[13.5px] font-semibold text-riv-ink-soft">Admin</span>
        }
        <span class="text-[15px] text-riv-ink-faint" aria-hidden="true">/</span>
        <button
          appTouchTarget
          type="button"
          class="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-2 text-riv-ink hover:bg-white/50"
          aria-haspopup="dialog"
          [attr.aria-expanded]="palette()?.open() ?? false"
          data-testid="proto-title"
          (click)="palette()?.toggle()"
        >
          <span class="truncate text-[17px] font-bold tracking-[-0.01em]">{{ title() }}</span>
          <kbd
            class="hidden rounded-md border border-riv-chip-border px-1.5 py-0.5 font-mono text-[11px] font-semibold text-riv-ink-soft sm:inline"
            >⌘K</kbd
          >
          <span class="text-[10px] opacity-85" aria-hidden="true">&#9662;</span>
        </button>
        <span class="ml-auto"></span>
        @if (
          ctx().surface === 'operator' && ctx().requestsCount > 0 && active()?.path !== 'requests'
        ) {
          <a
            appTouchTarget
            [routerLink]="['/operator', ctx().venueId, 'requests']"
            class="inline-flex items-center gap-2 rounded-xl px-2.5 text-[13.5px] font-semibold text-riv-ink no-underline hover:bg-white/50"
            data-testid="proto-requests-shortcut"
            ><span class="max-sm:hidden">Requests</span>
            <span [class]="badge">{{ ctx().requestsCount }}</span></a
          >
        }
        <app-proto-account-menu (signOut)="signOut.emit()" />
      </div>
    </header>

    <ng-container *ngTemplateOutlet="lead()" />
    <ng-container *ngTemplateOutlet="body()" />

    <app-proto-palette #jump [ctx]="ctx()" [items]="items()" />
  `,
})
export class ConsoleNavE {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly lead = input<TemplateRef<unknown> | null>(null);
  readonly body = input<TemplateRef<unknown> | null>(null);
  readonly signOut = output<void>();

  protected readonly operator = inject(OperatorAuth);
  private readonly router = inject(Router);
  private readonly url = currentUrl(this.router);
  protected readonly palette = viewChild(ProtoPalette);

  protected readonly bar = GLASS_BAR;
  protected readonly brand = BRAND;
  protected readonly badge = BADGE;

  protected readonly items = computed((): readonly NavItem[] => {
    const ctx = this.ctx();
    if (ctx.surface === 'operator') {
      return OPERATOR_NAV;
    }
    return ctx.surface === 'admin' && !ctx.navHidden ? ADMIN_NAV : [];
  });
  protected readonly active = computed(() =>
    activeItem(this.items(), this.url(), this.ctx().surface),
  );
  protected readonly title = computed(() => {
    const ctx = this.ctx();
    return this.active()?.label ?? (ctx.surface === 'admin' ? 'Admin console' : 'Your venues');
  });
}

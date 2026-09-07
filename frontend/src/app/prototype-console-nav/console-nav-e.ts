import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  TemplateRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { currentUrl } from '../shared/current-url';
import { TouchTarget } from '../shared/touch-target';
import {
  ADMIN_NAV,
  BACKDROP,
  BADGE,
  BRAND,
  ConsoleNavContext,
  GLASS_BAR,
  NavItem,
  OPERATOR_NAV,
  POP,
  activeItem,
  linkFor,
} from './console-nav-support';
import { ProtoAccountMenu } from './proto-account-menu';

/** One palette row: a destination, a venue, or a cross-console jump. */
interface PaletteRow {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly group: string;
  readonly link: readonly (string | number)[];
  readonly current: boolean;
  readonly badge?: number;
}

const ROW =
  'flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left no-underline hover:bg-riv-pop-hover aria-[current=page]:bg-riv-pop-hover aria-[current=page]:text-riv-pop-accent data-[hit]:bg-riv-pop-hover';

/**
 * PROTOTYPE variant E — "Palette". No strip at all: the bar reads as a path — brand / venue / the
 * current page's title — and the title is a button that opens a searchable list of everything
 * reachable (this console's sections with their hints, the other venues, the other console), also
 * on ⌘K / Ctrl-K. Typing filters; Enter opens the first hit. The one destination that keeps a
 * permanent slot in the bar is Requests when it has a count — the time-critical queue must not be
 * a keystroke away.
 *
 * <p>The question it asks: at nine admin destinations, is a list you search better than a row you
 * scan? The screenshots answer for discoverability: nothing on the page says what else exists.
 */
@Component({
  selector: 'app-console-nav-e',
  imports: [NgTemplateOutlet, RouterLink, TouchTarget, ProtoAccountMenu],
  host: {
    class: 'flex min-h-screen flex-col',
    '(document:keydown.escape)': 'close()',
    '(document:keydown.meta.k)': 'toggle($event)',
    '(document:keydown.control.k)': 'toggle($event)',
  },
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
          #titleButton
          appTouchTarget
          type="button"
          class="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl px-2 text-riv-ink hover:bg-white/50 sm:flex-initial"
          aria-haspopup="dialog"
          [attr.aria-expanded]="open()"
          data-testid="proto-title"
          (click)="toggle()"
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
            class="inline-flex shrink-0 items-center gap-2 rounded-xl px-2.5 text-[13.5px] font-semibold text-riv-ink no-underline hover:bg-white/50"
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

    @if (open()) {
      <div [class]="backdrop" (click)="close()" aria-hidden="true"></div>
      <div role="dialog" aria-label="Go to" [class]="palette" data-testid="proto-palette">
        <input
          #search
          appTouchTarget
          type="search"
          class="w-full rounded-xl border border-riv-field-border bg-riv-field-fill px-3.5 py-2.5 text-[15px] text-riv-pop-ink outline-none placeholder:text-riv-pop-ink-soft focus-visible:ring-[3px] focus-visible:ring-riv-accent-ink/40"
          placeholder="Jump to a section or venue…"
          aria-label="Jump to"
          autocomplete="off"
          [value]="query()"
          (input)="query.set(search.value)"
          (keydown.enter)="go()"
        />
        <ul class="mt-2 max-h-[60vh] list-none overflow-y-auto p-0" role="list">
          @for (row of rows(); track row.key; let first = $first) {
            <li>
              <a
                appTouchTarget
                [routerLink]="row.link"
                [class]="rowCls"
                [attr.aria-current]="row.current ? 'page' : null"
                [attr.data-hit]="first && query() !== '' ? '' : null"
                (click)="close()"
              >
                <span class="flex min-w-0 flex-1 flex-col leading-tight">
                  <span class="truncate text-[14.5px] font-semibold">{{ row.label }}</span>
                  <span class="truncate text-[12px] text-riv-pop-ink-soft">{{ row.hint }}</span>
                </span>
                @if (row.badge) {
                  <span [class]="badge">{{ row.badge }}</span>
                }
                <span
                  class="text-[10.5px] font-bold tracking-[0.12em] text-riv-pop-ink-soft uppercase"
                  >{{ row.group }}</span
                >
              </a>
            </li>
          } @empty {
            <li class="px-3 py-4 text-[14px] text-riv-pop-ink-soft">Nothing matches.</li>
          }
        </ul>
      </div>
    }
  `,
})
export class ConsoleNavE {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly lead = input<TemplateRef<unknown> | null>(null);
  readonly body = input<TemplateRef<unknown> | null>(null);
  readonly signOut = output<void>();

  protected readonly operator = inject(OperatorAuth);
  private readonly owned = inject(OwnedVenues);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly url = currentUrl(this.router);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly titleButton = viewChild<ElementRef<HTMLButtonElement>>('titleButton');

  protected readonly bar = GLASS_BAR;
  protected readonly brand = BRAND;
  protected readonly badge = BADGE;
  protected readonly backdrop = BACKDROP;
  protected readonly rowCls = ROW;
  protected readonly palette = `fixed top-[12vh] left-1/2 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 p-2.5 ${POP}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');

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

  private readonly allRows = computed((): PaletteRow[] => {
    const ctx = this.ctx();
    const active = this.active();
    const sections = this.items().map((item): PaletteRow => ({
      key: `s:${item.path}`,
      label: item.label,
      hint: item.hint,
      group: item.group,
      link: linkFor(item, ctx),
      current: item === active,
      badge: item.badge && ctx.requestsCount > 0 ? ctx.requestsCount : undefined,
    }));
    const venues = (this.owned.venues() ?? []).map((venue): PaletteRow => ({
      key: `v:${venue.id}`,
      label: venue.name,
      hint: `Open ${venue.beach} · ${active?.path === undefined || ctx.surface !== 'operator' ? 'beach map' : active.label.toLowerCase()}`,
      group: 'Venue',
      link: [
        '/operator',
        venue.id,
        ctx.surface === 'operator' ? (active?.path ?? 'beach-map') : 'beach-map',
      ],
      current: ctx.surface === 'operator' && venue.id === ctx.venueId,
    }));
    const cross: PaletteRow[] = [];
    if (ctx.surface !== 'admin' && this.operator.isAdmin()) {
      cross.push({
        key: 'x:admin',
        label: 'Admin console',
        hint: 'Operators, outboxes, moderation, audit',
        group: 'Platform',
        link: ['/admin'],
        current: false,
      });
    }
    cross.push({
      key: 'x:password',
      label: 'Change password',
      hint: 'Your operator account',
      group: 'Account',
      link: ['/account/operator-password'],
      current: false,
    });
    return [...sections, ...venues, ...cross];
  });

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (q === '') {
      return this.allRows();
    }
    return this.allRows().filter((row) =>
      `${row.label} ${row.hint} ${row.group}`.toLowerCase().includes(q),
    );
  });

  protected toggle(event?: Event): void {
    event?.preventDefault();
    if (this.open()) {
      this.close();
      return;
    }
    this.query.set('');
    this.open.set(true);
    afterNextRender(() => this.search()?.nativeElement.focus(), { injector: this.injector });
  }

  protected close(): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.titleButton()?.nativeElement.focus();
  }

  protected go(): void {
    const first = this.rows()[0];
    if (first) {
      this.close();
      void this.router.navigate([...first.link]);
    }
  }
}

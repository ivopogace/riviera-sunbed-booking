import {
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { currentUrl } from '../shared/current-url';
import { TouchTarget } from '../shared/touch-target';
import {
  BACKDROP,
  BADGE,
  ConsoleNavContext,
  NavItem,
  POP,
  activeItem,
  linkFor,
} from './console-nav-support';
import { ProtoIcon } from './proto-icon';

/** One palette row: a destination, a venue, or a cross-console jump. */
interface PaletteRow {
  readonly key: string;
  readonly icon: string;
  readonly label: string;
  readonly hint: string;
  readonly group: string;
  readonly link: readonly (string | number)[];
  readonly current: boolean;
  readonly badge?: number;
}

const ROW =
  'flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left no-underline hover:bg-riv-pop-hover aria-[current=page]:bg-riv-pop-hover aria-[current=page]:text-riv-pop-accent data-[hit]:bg-riv-pop-hover [&_svg]:size-[18px] [&_svg]:shrink-0';

/**
 * PROTOTYPE — the ⌘K / Ctrl-K jump palette: everything reachable from here (this console's
 * sections with their hints, the other venues, the other console, the account page), filtered by
 * typing; Enter opens the first hit; Escape closes and returns focus to whatever opened it. A
 * host renders it once and calls {@link toggle} from its own trigger; the key chords are the
 * palette's own.
 */
@Component({
  selector: 'app-proto-palette',
  imports: [RouterLink, TouchTarget, ProtoIcon],
  host: {
    class: 'contents',
    '(document:keydown.escape)': 'close()',
    '(document:keydown.meta.k)': 'toggle($event)',
    '(document:keydown.control.k)': 'toggle($event)',
  },
  template: `
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
                <app-proto-icon [name]="row.icon" />
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
export class ProtoPalette {
  readonly ctx = input.required<ConsoleNavContext>();
  readonly items = input.required<readonly NavItem[]>();

  private readonly operator = inject(OperatorAuth);
  private readonly owned = inject(OwnedVenues);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly url = currentUrl(this.router);
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private opener: HTMLElement | null = null;

  protected readonly badge = BADGE;
  protected readonly backdrop = BACKDROP;
  protected readonly rowCls = ROW;
  protected readonly palette = `fixed top-[12vh] left-1/2 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 p-2.5 ${POP}`;
  readonly open = signal(false);
  protected readonly query = signal('');

  private readonly active = computed(() =>
    activeItem(this.items(), this.url(), this.ctx().surface),
  );

  private readonly allRows = computed((): PaletteRow[] => {
    const ctx = this.ctx();
    const active = this.active();
    const sections = this.items().map((item): PaletteRow => ({
      key: `s:${item.path}`,
      icon: item.icon,
      label: item.label,
      hint: item.hint,
      group: item.group,
      link: linkFor(item, ctx),
      current: item === active,
      badge: item.badge && ctx.requestsCount > 0 ? ctx.requestsCount : undefined,
    }));
    const keep = ctx.surface === 'operator' ? (active?.path ?? 'beach-map') : 'beach-map';
    const venues = (this.owned.venues() ?? []).map((venue): PaletteRow => ({
      key: `v:${venue.id}`,
      icon: 'venues',
      label: venue.name,
      hint: `Open ${venue.beach}`,
      group: 'Venue',
      link: ['/operator', venue.id, keep],
      current: ctx.surface === 'operator' && venue.id === ctx.venueId,
    }));
    const cross: PaletteRow[] = [];
    if (ctx.surface !== 'admin' && this.operator.isAdmin()) {
      cross.push({
        key: 'x:admin',
        icon: 'admin',
        label: 'Admin console',
        hint: 'Operators, outboxes, moderation, audit',
        group: 'Platform',
        link: ['/admin'],
        current: false,
      });
    }
    cross.push({
      key: 'x:password',
      icon: 'privacy',
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

  toggle(event?: Event): void {
    event?.preventDefault();
    if (this.open()) {
      this.close();
      return;
    }
    this.opener = document.activeElement as HTMLElement | null;
    this.query.set('');
    this.open.set(true);
    afterNextRender(() => this.search()?.nativeElement.focus(), { injector: this.injector });
  }

  close(): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.opener?.focus();
  }

  protected go(): void {
    const first = this.rows()[0];
    if (first) {
      this.close();
      void this.router.navigate([...first.link]);
    }
  }
}

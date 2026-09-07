import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { TouchTarget } from '../shared/touch-target';
import { BACKDROP, CHIP_BTN, POP, POP_ITEM } from './console-nav-support';

/**
 * PROTOTYPE — the in-place venue switcher. Today a multi-venue operator changes venue only by
 * going brand → `/operator` → picker; this control puts the owned-venue list under the venue's own
 * name, and keeps the current section (`/operator/7/daily` → `/operator/9/daily`). With one venue
 * it renders the name as plain text and nothing opens — the name is then a label, not a control.
 *
 * <p>Invariant #13 is what makes the venue name the most important word in the bar: every console
 * action is venue-scoped, so the current venue must be unambiguous. `emphasis="title"` renders it
 * at title weight; `"row"` renders the compact sidebar row.
 */
@Component({
  selector: 'app-proto-venue-switch',
  imports: [RouterLink, TouchTarget],
  host: { class: 'relative flex min-w-0 items-center', '(document:keydown.escape)': 'close()' },
  template: `
    @if (!operator.signedIn()) {
    } @else if (venues().length > 1 || venueId() === undefined) {
      <button
        appTouchTarget
        type="button"
        [class]="chip()"
        [attr.aria-expanded]="open()"
        aria-haspopup="true"
        data-testid="proto-venue-switch"
        (click)="open.set(!open())"
      >
        <span class="min-w-0 truncate">{{ venueName() ?? 'Your venues' }}</span>
        <span class="shrink-0 text-[10px] opacity-85" aria-hidden="true">&#9662;</span>
      </button>
      @if (open()) {
        <div [class]="backdrop" (click)="close()" aria-hidden="true"></div>
        <div [class]="pop()" data-testid="proto-venue-menu">
          <p
            class="px-2.5 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.14em] text-riv-pop-ink-soft uppercase"
          >
            Your venues
          </p>
          @for (venue of venues(); track venue.id) {
            <a
              appTouchTarget
              [routerLink]="['/operator', venue.id, section()]"
              [class]="popItem"
              [attr.aria-current]="venue.id === venueId() ? 'page' : null"
              (click)="close()"
            >
              <span class="flex min-w-0 flex-col leading-tight">
                <span class="truncate">{{ venue.name }}</span>
                <span class="truncate text-[12px] font-medium text-riv-pop-ink-soft">{{
                  venue.beach
                }}</span>
              </span>
            </a>
          }
          <a
            appTouchTarget
            routerLink="/operator"
            [queryParams]="{ create: '1' }"
            [class]="popItem + ' mt-1 border-t border-riv-pop-divider pt-3 text-riv-pop-ink-soft'"
            (click)="close()"
            >+ Add another venue</a
          >
        </div>
      }
    } @else {
      <span [class]="plain()" data-testid="proto-venue-name">{{
        venueName() ?? 'Your venue'
      }}</span>
    }
  `,
})
export class ProtoVenueSwitch {
  readonly venueId = input<number | undefined>(undefined);
  readonly venueName = input<string | undefined>(undefined);
  /** The section to keep when switching venue (`daily`), or the console default. */
  readonly section = input('beach-map');
  readonly emphasis = input<'title' | 'row' | 'chip'>('chip');
  readonly placement = input<'down' | 'up'>('down');

  private readonly owned = inject(OwnedVenues);
  protected readonly operator = inject(OperatorAuth);
  protected readonly open = signal(false);
  protected readonly backdrop = BACKDROP;
  protected readonly popItem = POP_ITEM;

  protected readonly venues = computed(() => this.owned.venues() ?? []);
  protected readonly chip = computed(() => {
    switch (this.emphasis()) {
      case 'title':
        return `${CHIP_BTN} max-w-full border-transparent bg-transparent px-1 text-[17px] font-bold tracking-[-0.01em]`;
      case 'row':
        return `${CHIP_BTN} w-full justify-between rounded-[12px] text-[14px]`;
      default:
        return `${CHIP_BTN} max-w-[150px] sm:max-w-[260px]`;
    }
  });
  protected readonly plain = computed(() =>
    this.emphasis() === 'title'
      ? 'truncate text-[17px] font-bold tracking-[-0.01em] text-riv-ink'
      : 'truncate text-[14px] font-semibold text-riv-ink',
  );
  protected readonly pop = computed(() =>
    this.placement() === 'up'
      ? `bottom-[calc(100%+8px)] left-0 w-[264px] p-[7px] ${POP}`
      : `top-[calc(100%+8px)] left-0 w-[264px] p-[7px] ${POP}`,
  );

  constructor() {
    // A deep-linked console never loads the owned list today; the switcher needs it.
    effect(() => {
      if (this.operator.signedIn()) {
        untracked(() => void this.owned.load());
      }
    });
  }

  protected close(): void {
    this.open.set(false);
  }
}

import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { beachLabel } from '../shared/beaches';
import { POP_BACKDROP, POP_ITEM, POP_SKIN } from '../shared/popover-skin';
import { TouchTarget } from '../shared/touch-target';

/** The venue name at title weight — the most legible word in the bar (invariant #13: every
 *  console action is venue-scoped, so the current venue must be unambiguous). */
const NAME = 'min-w-0 max-w-full truncate text-[17px] font-bold tracking-[-0.01em] text-riv-ink';

/**
 * The console shell's venue slot and, for a multi-venue operator, the venue switch: a `Your venues`
 * popover whose rows (current one `aria-current="page"`) link to the SAME section on the other
 * venue; the router reuses the console, so per-venue state resets only via its `venueId` reload.
 * One venue: a plain name; off the console: `Your venues`; signed out: nothing. It triggers the
 * {@link OwnedVenues} read (a failure leaves the name plain). Focus legs match the account chip
 * (WCAG 2.4.3); the `fixed` popover anchors to the header, whose `backdrop-filter` contains it.
 */
@Component({
  selector: 'app-operator-venue-switch',
  imports: [RouterLink, TouchTarget],
  host: {
    class: 'flex min-w-0 items-center',
    '(document:keydown.escape)': 'dismiss()',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    @if (operator.signedIn()) {
      @if (venues().length > 1) {
        <button
          appTouchTarget
          #name
          type="button"
          [class]="cls.button"
          aria-haspopup="true"
          [attr.aria-expanded]="open()"
          data-testid="oc-venue-title"
          (click)="toggle()"
        >
          <span class="min-w-0 truncate">{{ label() }}</span>
          <span class="shrink-0 text-[10px] opacity-85" aria-hidden="true">&#9662;</span>
        </button>
        @if (open()) {
          <div
            [class]="cls.backdrop"
            data-testid="oc-venue-backdrop"
            (click)="dismiss()"
            aria-hidden="true"
          ></div>
          <div
            [class]="cls.pop"
            role="group"
            aria-labelledby="oc-venue-menu-title"
            data-testid="oc-venue-menu"
          >
            <p
              id="oc-venue-menu-title"
              class="m-0 px-2.5 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.14em] text-riv-pop-ink-soft uppercase"
            >
              Your venues
            </p>
            @for (venue of venues(); track venue.id) {
              <a
                appTouchTarget
                [routerLink]="rowLink(venue.id)"
                [class]="cls.item"
                [attr.aria-current]="venue.id === venueId() ? 'page' : null"
                (click)="activate()"
              >
                <span class="block truncate">{{ venue.name }}</span>
                <span class="block truncate text-[12px] font-medium text-riv-pop-ink-soft">{{
                  beachLabel(venue.beach)
                }}</span>
              </a>
            }
            <div class="mx-2.5 my-1 border-t border-riv-pop-divider" aria-hidden="true"></div>
            <a
              appTouchTarget
              routerLink="/operator"
              [queryParams]="{ create: '1' }"
              [class]="cls.item"
              data-testid="oc-venue-add"
              (click)="activate()"
              >Add another venue</a
            >
          </div>
        }
      } @else if (venueId() !== undefined) {
        <span [class]="cls.plain" data-testid="oc-venue-title">{{ label() }}</span>
      } @else {
        <a appTouchTarget routerLink="/operator" [class]="cls.link" data-testid="oc-venue-title">{{
          label()
        }}</a>
      }
    }
  `,
})
export class OperatorVenueSwitch {
  /** The beach as the operator or admin reads it, off the catalogue mirror. */
  protected readonly beachLabel = beachLabel;
  /** The venue the console manages — its row is the current one; `undefined` off the console. */
  readonly venueId = input<number | undefined>(undefined);
  /** The name from the best-effort venue read; `Your venue` until it lands. */
  readonly venueName = input<string | undefined>(undefined);
  /** The console section to keep across a switch (`daily`, `beach-map`, …); `undefined` off the
   *  console, where a row lands on the console's index redirect. */
  readonly section = input<string | undefined>(undefined);

  protected readonly operator = inject(OperatorAuth);
  private readonly owned = inject(OwnedVenues);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly nameButton = viewChild<ElementRef<HTMLButtonElement>>('name');

  protected readonly open = signal(false);
  protected readonly cls = {
    button: `inline-flex cursor-pointer touch-manipulation items-center gap-1.5 rounded-lg px-1 ${NAME}`,
    plain: `px-1 ${NAME}`,
    link: `inline-flex items-center rounded-lg px-1 no-underline hover:underline ${NAME}`,
    backdrop: POP_BACKDROP,
    // left: the shell row's content edge — its centred 1120px box's left plus the row's px-6 (560 − 24), the px-6 alone once the header is narrower.
    pop: `fixed top-full left-[max(1.5rem,50%_-_536px)] mt-1 w-[264px] max-w-[calc(100%-3rem)] p-[7px] ${POP_SKIN}`,
    item: POP_ITEM,
  } as const;

  protected readonly venues = computed(() => this.owned.venues() ?? []);
  protected readonly label = computed(() =>
    this.venueId() === undefined ? 'Your venues' : (this.venueName() ?? 'Your venue'),
  );

  constructor() {
    effect(() => {
      if (this.operator.signedIn()) {
        untracked(() => void this.owned.load());
      }
    });
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  /** A venue row's target: the same section on that venue, or its console's index off the console. */
  protected rowLink(venueId: number): readonly (string | number)[] {
    const section = this.section();
    return section === undefined ? ['/operator', venueId] : ['/operator', venueId, section];
  }

  /** A row was activated: close, and hand focus back to the button the row's unmount would strand it from. */
  protected activate(): void {
    this.open.set(false);
    this.nameButton()?.nativeElement.focus();
  }

  /** Escape or the backdrop: the same close, a no-op while closed so it never steals focus. */
  protected dismiss(): void {
    if (this.open()) {
      this.activate();
    }
  }

  /** A click below the header: close, leaving focus on whatever was clicked. */
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}

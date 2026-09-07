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
import { POP_BACKDROP, POP_ITEM, POP_SKIN } from '../shared/popover-skin';
import { TouchTarget } from '../shared/touch-target';

/** The venue name at title weight — the most legible word in the bar (invariant #13: every
 *  console action is venue-scoped, so the current venue must be unambiguous). */
const NAME = 'min-w-0 max-w-full truncate text-[17px] font-bold tracking-[-0.01em] text-riv-ink';

/**
 * The venue console's venue name, and — for an operator who owns more than one venue — the control
 * that changes it: a disclosure button opening a popover headed `Your venues` that lists the owned
 * venues (name over beach), marks the current one `aria-current="page"`, links each row to the
 * **same section** on the other venue (`/operator/7/daily` → `/operator/9/daily`, the router then
 * reuses the console instance and its reactive `venueId` reload does the rest), and ends in
 * `Add another venue`. With exactly one venue the name is plain text and nothing opens — a label,
 * not a control. Signed out it renders nothing. The `/operator` picker stays the landing for a
 * bookmark with no venue.
 *
 * <p>It reads the session-scoped {@link OwnedVenues} store and is the console's one trigger for
 * that read: only the landing and the guard read it today, so a bookmark straight into a console
 * would otherwise render a switcher with nothing to switch to. The store dedupes and caches, so
 * this costs no second request after the landing. A failed read leaves the list unknown and the
 * name plain — never an empty popover.
 *
 * <p>The disclosure is the account chip's, leg for leg (WCAG 2.4.3): Escape, the backdrop and a row
 * activation return focus to the name button; a navigation that ends elsewhere, or a click outside
 * the header, closes without moving it. The popover is anchored to the header row (the nearest
 * positioned ancestor — the console makes its header row `relative`), left-aligned with the row's
 * `px-6`, not to the name: at 344px a name-anchored 264px popover overhangs the viewport.
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
                [routerLink]="['/operator', venue.id, section()]"
                [class]="cls.item"
                [attr.aria-current]="venue.id === venueId() ? 'page' : null"
                (click)="activate()"
              >
                <span class="block truncate">{{ venue.name }}</span>
                <span class="block truncate text-[12px] font-medium text-riv-pop-ink-soft">{{
                  venue.beach
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
      } @else {
        <span [class]="cls.plain" data-testid="oc-venue-title">{{ label() }}</span>
      }
    }
  `,
})
export class OperatorVenueSwitch {
  /** The venue this console manages: its row is the current one. */
  readonly venueId = input.required<number>();
  /** The name from the best-effort venue read; `Your venue` until it lands. */
  readonly venueName = input<string | undefined>(undefined);
  /** The console section to keep across a switch (`daily`, `beach-map`, …). */
  readonly section = input.required<string>();

  protected readonly operator = inject(OperatorAuth);
  private readonly owned = inject(OwnedVenues);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly nameButton = viewChild<ElementRef<HTMLButtonElement>>('name');

  protected readonly open = signal(false);
  protected readonly cls = {
    button: `inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-1 ${NAME}`,
    plain: `px-1 ${NAME}`,
    backdrop: POP_BACKDROP,
    pop: `absolute top-full left-6 mt-1 w-[264px] max-w-[calc(100%-3rem)] p-[7px] ${POP_SKIN}`,
    item: POP_ITEM,
  } as const;

  protected readonly venues = computed(() => this.owned.venues() ?? []);
  protected readonly label = computed(() => this.venueName() ?? 'Your venue');

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

import { NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  Type,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  Router,
  RouterLink,
} from '@angular/router';
import { filter } from 'rxjs';

import { focusMover } from './focus-after-render';
import { trapFocusWithin } from './focus-trap';
import { POP_BACKDROP, POP_NAV_HINT, POP_NAV_ROW, POP_SKIN } from './popover-skin';
import { TAB_RAIL_BADGE } from './tab-rail';
import { TouchTarget } from './touch-target';

/** One palette row: a section of this console, an owned venue, the other console or the account page. */
export interface PaletteRow {
  readonly key: string;
  readonly glyph: Type<unknown>;
  readonly label: string;
  /** One line under the label; the filter reads it too. */
  readonly hint: string;
  /** The uppercase tag at the row's right (`Today`, `Venue`, `Account`, …); the filter reads it too. */
  readonly group: string;
  readonly link: readonly (string | number)[];
  /** The row is the page the operator is on: `aria-current="page"`. */
  readonly current: boolean;
  /** A live count on the row (the Requests queue); absent or 0 renders none. */
  readonly badge?: number;
}

/** Template skins, hoisted so each recipe exists once (the `app.ts` `cls` idiom). */
const CLS = {
  backdrop: POP_BACKDROP,
  // Under the section row, centred; `translate` (the axis) composes with the pop keyframe's `transform`.
  dialog: `fixed top-[12vh] left-1/2 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 p-2.5 ${POP_SKIN}`,
  // The field keeps the 3px baseline ring, its offset tightened to the field (`riviera-tailwind` rule 6).
  field:
    'w-full rounded-xl border border-riv-field-border bg-riv-field-fill px-3.5 py-2.5 text-[15px] text-riv-pop-ink placeholder:text-riv-pop-ink-soft focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-riv-accent-ink',
  list: 'mt-2 max-h-[60vh] overflow-y-auto',
  // The first hit wears the hover fill, so Enter's target reads on touch and keyboard alike.
  row: `${POP_NAV_ROW} data-[hit]:bg-riv-pop-hover`,
  hint: `${POP_NAV_HINT} truncate`,
  badge: TAB_RAIL_BADGE,
  group: 'shrink-0 text-[10.5px] font-bold tracking-[0.12em] text-riv-pop-ink-soft uppercase',
  empty: 'm-0 px-3.5 py-4 text-[14px] text-riv-pop-ink-soft',
} as const;

/**
 * The ⌘K / Ctrl-K jump palette of the console shell (`console-shell.ts`): a modal dialog named
 * `Go to` with a search field over everything reachable from here — the host hands it the rows
 * ({@link PaletteRow}: this console's sections with their hints and the Requests count, the owned
 * venues, the other console, `Change password`), and this component owns only the dialog. Typing
 * filters the rows by label, hint and group (case-insensitive substring); the first hit is
 * highlighted and Enter opens it; a query with no hit reads `Nothing matches.` — a status region
 * that is in the dialog from the start and only changes its text, so the change is announced — and
 * Enter does nothing, as it does before anything is typed. Escape, the backdrop, a row and a second chord close
 * it. The chords are document listeners of the palette's own, so they exist only while the host
 * renders it — a signed-out visitor on an admin URL has neither the dialog nor the listener.
 *
 * <p>Focus is moved on every leg (WCAG 2.4.3): open lands it on the field; every close hands it back
 * to the **opener** — the element the host passed to {@link toggle} (its search glyph), or the
 * element that held focus when the chord fired — and, when a navigation the palette drove has
 * unmounted that opener, to the app shell's `<main>`. A navigation that ends with the dialog open
 * (Back, Forward) closes it the same way. A row for the page the operator is on is a same-URL
 * navigation the router skips rather than ends, so it leaves no re-landing pending, and a
 * navigation the router skips, cancels or fails clears one — nothing is left to move focus on a
 * later, unrelated navigation. Tab is trapped inside the dialog (`focus-trap.ts`), so
 * the rows are reachable by keyboard without arrow-key roving.
 *
 * <p>Rendered by the host as a sibling of its header: the header's `backdrop-filter` would
 * otherwise be the `fixed` dialog's containing block and pin it to the header. `contents` host, so
 * the dialog and backdrop position against the viewport.
 */
@Component({
  selector: 'app-console-palette',
  imports: [NgComponentOutlet, RouterLink, TouchTarget],
  host: {
    class: 'contents',
    '(document:keydown.escape)': 'dismiss()',
    '(document:keydown.meta.k)': 'onChord($event)',
    '(document:keydown.control.k)': 'onChord($event)',
  },
  template: `
    @if (open()) {
      <div
        [class]="cls.backdrop"
        data-testid="oc-palette-backdrop"
        (click)="dismiss()"
        aria-hidden="true"
      ></div>
      <div
        [class]="cls.dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        data-testid="oc-palette"
        (keydown.tab)="trapFocus($event, false)"
        (keydown.shift.tab)="trapFocus($event, true)"
      >
        <input
          appTouchTarget
          #search
          type="search"
          [class]="cls.field"
          placeholder="Jump to a section or venue…"
          aria-label="Jump to"
          autocomplete="off"
          data-testid="oc-palette-search"
          [value]="query()"
          (input)="query.set(search.value)"
          (keydown.enter)="go()"
        />
        <p
          [class]="hits().length > 0 ? 'sr-only' : cls.empty"
          role="status"
          data-testid="oc-palette-empty"
        >
          {{ hits().length > 0 ? '' : 'Nothing matches.' }}
        </p>
        @if (hits().length > 0) {
          <ul [class]="cls.list" role="list">
            @for (row of hits(); track row.key; let first = $first) {
              <li>
                <a
                  appTouchTarget
                  [routerLink]="row.link"
                  [class]="cls.row"
                  [attr.aria-current]="row.current ? 'page' : null"
                  [attr.data-hit]="first && hit() ? '' : null"
                  data-testid="oc-palette-row"
                  (click)="activate(row)"
                >
                  <ng-container *ngComponentOutlet="row.glyph" />
                  <span class="flex min-w-0 flex-1 flex-col leading-tight">
                    <span class="truncate">{{ row.label }}</span>
                    <span [class]="cls.hint">{{ row.hint }}</span>
                  </span>
                  @if (row.badge) {
                    <span [class]="cls.badge" data-testid="oc-palette-badge">{{ row.badge }}</span>
                  }
                  <span [class]="cls.group">{{ row.group }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class ConsolePalette {
  /** Everything reachable from the host's current page, in the order the dialog lists it. */
  readonly rows = input.required<readonly PaletteRow[]>();

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly focusAfterRender = focusMover();
  private readonly openState = signal(false);
  /** What opened the dialog: focus returns here on close. */
  private opener: HTMLElement | null = null;
  /** A row or Enter drove a navigation: once it ends, focus is re-landed (the opener may be gone);
   *  a navigation the router skips, cancels or fails clears it. */
  private leftFor = false;

  /** Whether the dialog is up — the host's trigger binds `aria-expanded` to it. */
  readonly open = this.openState.asReadonly();
  protected readonly cls = CLS;
  protected readonly query = signal('');

  protected readonly hits = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q === ''
      ? this.rows()
      : this.rows().filter((row) =>
          `${row.label} ${row.hint} ${row.group}`.toLowerCase().includes(q),
        );
  });
  /** A non-empty query with at least one hit: the first row is highlighted and is Enter's target. */
  protected readonly hit = computed(() => this.query().trim() !== '' && this.hits().length > 0);

  constructor() {
    this.router.events
      .pipe(
        filter(
          (event) =>
            event instanceof NavigationEnd ||
            event instanceof NavigationSkipped ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError,
        ),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.onNavigationEnd();
        } else {
          this.leftFor = false;
        }
      });
  }

  /** Open onto the field, remembering `opener` (or the element focused now) for the close; or close. */
  toggle(opener?: HTMLElement | null): void {
    if (this.openState()) {
      this.close();
      return;
    }
    this.opener = opener ?? (this.document.activeElement as HTMLElement | null);
    this.query.set('');
    this.openState.set(true);
    this.focusAfterRender('oc-palette-search');
  }

  /** ⌘K / Ctrl-K: the palette's own chord, so the browser never sees it. */
  protected onChord(event: Event): void {
    event.preventDefault();
    this.toggle();
  }

  /** Escape or the backdrop: a no-op while closed so it never steals focus. */
  protected dismiss(): void {
    if (this.openState()) {
      this.close();
    }
  }

  /** A row was chosen: close, hand focus back, and — when the row leads somewhere else — re-land
   *  it once the navigation has ended. A row for the page the operator is on is the router's
   *  same-URL case, skipped rather than ended, so nothing is left pending. */
  protected activate(row: PaletteRow): void {
    this.leftFor =
      this.router.serializeUrl(this.router.createUrlTree([...row.link])) !== this.router.url;
    this.close();
  }

  /** Enter in the field: open the highlighted hit, if there is one. */
  protected go(): void {
    if (!this.hit()) {
      return;
    }
    const first = this.hits()[0];
    this.activate(first);
    void this.router.navigate([...first.link]);
  }

  protected trapFocus(event: Event, backwards: boolean): void {
    trapFocusWithin(event.currentTarget as HTMLElement, event, backwards);
  }

  private close(): void {
    this.openState.set(false);
    this.landFocus();
  }

  /** The dialog was open, or a row just drove this navigation: close, and re-land focus after the
   *  new page has rendered if the dialog held it or the opener may have unmounted. */
  private onNavigationEnd(): void {
    const held = this.openState() && this.host.nativeElement.contains(this.document.activeElement);
    const relanding = held || this.leftFor;
    this.leftFor = false;
    this.openState.set(false);
    if (relanding) {
      afterNextRender(() => this.landFocus(), { injector: this.injector });
    }
  }

  /** The opener while it is still in the document, else the app shell's `<main>`. */
  private landFocus(): void {
    const target = this.opener?.isConnected
      ? this.opener
      : this.document.querySelector<HTMLElement>('main');
    target?.focus();
  }
}

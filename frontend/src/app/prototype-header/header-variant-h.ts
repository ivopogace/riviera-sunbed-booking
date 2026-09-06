import { Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { CustomerAuth } from '../core/customer-auth';
import { ThemeId, ThemeService } from '../core/theme';
import { focusMover } from '../shared/focus-after-render';
import { TouchTarget } from '../shared/touch-target';
import {
  AVATAR,
  BACKDROP,
  EXACT_PATH,
  GLASS_HEADER,
  OpenSurface,
  POP,
  POP_BTN,
  POP_ITEM,
  SHEET_ITEM,
  THEME_OPTION,
  handleOf,
  initialOf,
} from './prototype-header-support';

const TAB =
  'relative inline-flex h-full min-h-11 cursor-pointer items-center px-3 text-[13.5px] font-semibold text-riv-ink-soft [transition:color_0.15s_ease] hover:text-riv-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-current after:opacity-0 after:content-[""] aria-[current=page]:text-riv-ink aria-[current=page]:after:opacity-100';

/** The current tab is a SHAPE cue in full ink — a 3px bar at the top edge plus a full-ink ring
 *  round the icon pill — because no tint the tokens offer clears 1.4.11's 3:1 on the bar: the
 *  0.12 accent fill measured 1.10–1.22:1 and full-vs-soft ink 1.22–2.54:1 (prototype-shots/review-h-contrast.mjs). */
const BOTTOM_TAB =
  'relative flex min-h-[60px] cursor-pointer flex-col items-center justify-center gap-[3px] text-[11px] font-semibold text-riv-ink-soft before:absolute before:top-0 before:h-[3px] before:w-9 before:rounded-b-full before:bg-current before:opacity-0 before:content-[""] aria-[current=page]:text-riv-ink aria-[current=page]:before:opacity-100 aria-[current=page]:[&>span]:ring-[1.5px] aria-[current=page]:[&>span]:ring-current [&_svg]:size-[21px]';

const BOTTOM_ICON =
  'grid h-7 w-12 place-items-center rounded-full [transition:background_0.15s_ease] motion-reduce:transition-none';

/** The swatch's boundary is a 1.5px ring in `--riv-ink-soft` (5.4 / 5.5 / 11.6:1 on the three
 *  bars) — the swatch itself is 1.0–2.8:1 against the bar it sits on, and a white inset ring is
 *  invisible on porcelain, so without the ring the control had no 1.4.11 boundary at all. */
const SWATCH_BTN =
  'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full before:size-[22px] before:rounded-full before:bg-(image:--riv-swatch) before:shadow-[0_1px_3px_rgba(6,30,40,0.35)] before:ring-[1.5px] before:ring-riv-ink-soft before:[transition:scale_0.12s_ease] before:content-[""] hover:before:scale-[1.12] motion-reduce:before:transition-none motion-reduce:hover:before:scale-100';

const MENU_BTN =
  'inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-riv-chip-border bg-riv-chip-bg text-riv-ink backdrop-blur-[10px] [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none';

const ACCOUNT_CHIP =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-riv-chip-border bg-riv-chip-bg px-3 text-[13.5px] font-semibold text-riv-ink backdrop-blur-[10px] [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none';

/** Which bottom tab a URL belongs to: the tab bar lights by section, not by exact path. */
type Section = 'beaches' | 'bookings' | 'account' | null;

function sectionOf(path: string): Section {
  const first = path.split('?')[0].split('/')[1] ?? '';
  if (first === '' || first === 'venues') {
    return 'beaches';
  }
  if (first === 'my-bookings' || first === 'booking') {
    return 'bookings';
  }
  return first === 'account' ? 'account' : null;
}

/**
 * PROTOTYPE variant H — "Two destinations". The hybrid the grilling answers describe and no
 * lettered variant implements: the primary nav carries only the two real destinations (Beaches,
 * My bookings), "Find a booking" drops to a row in the account menu beside sign-in, and the theme
 * stays visible in the bar as a bare swatch rather than being buried a tap deeper. On phones the
 * two destinations plus the account become a three-tab bottom bar, so nav is thumb-reachable and
 * the top bar shrinks to brand + swatch.
 */
@Component({
  selector: 'app-header-variant-h',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: { class: 'contents', '(document:keydown.escape)': 'close()' },
  template: `
    @if (!checkout()) {
      <nav [class]="cls.bottomNav" aria-label="Primary (phone)">
        <a
          appTouchTarget
          routerLink="/"
          [attr.aria-current]="section() === 'beaches' ? 'page' : null"
          [class]="cls.bottomTab"
        >
          <span [class]="cls.bottomIcon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z" />
              <path d="M12 3v9" />
              <path d="M12 12v6a2.5 2.5 0 0 0 5 0" />
            </svg>
          </span>
          Beaches
        </a>
        <a
          appTouchTarget
          routerLink="/my-bookings"
          [attr.aria-current]="section() === 'bookings' ? 'page' : null"
          [class]="cls.bottomTab"
        >
          <span [class]="cls.bottomIcon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6Z"
              />
              <path d="M14 5v14" />
            </svg>
          </span>
          My bookings
        </a>
        <button
          #menuTab
          appTouchTarget
          type="button"
          [class]="cls.bottomTab"
          [attr.aria-current]="section() === 'account' && customerAuth.signedIn() ? 'page' : null"
          [attr.aria-label]="accountLabel()"
          [attr.aria-expanded]="open() === 'menu'"
          (click)="toggle('menu')"
        >
          <span [class]="cls.bottomIcon">
            @if (customerAuth.signedIn()) {
              <span [class]="cls.avatar + ' size-[21px] text-[11px]'" aria-hidden="true">{{
                initial()
              }}</span>
            } @else {
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
              </svg>
            }
          </span>
          {{ customerAuth.signedIn() ? 'Account' : 'Menu' }}
        </button>
      </nav>
    }

    <header [class]="cls.header">
      <div
        class="relative mx-auto flex h-14 w-full max-w-[1080px] items-stretch gap-3 px-4 sm:px-6"
      >
        <a appTouchTarget class="flex items-center gap-2.5 text-riv-ink" routerLink="/">
          <span
            class="block size-[26px] rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_0_3px_rgba(255,255,255,0.18),0_3px_10px_rgba(240,170,46,0.5)]"
            aria-hidden="true"
          ></span>
          <span class="text-[19px] font-bold tracking-[-0.01em]">Riviera</span>
        </a>

        <nav class="ml-auto hidden items-stretch sm:flex" aria-label="Primary">
          <a
            appTouchTarget
            routerLink="/"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="exactPath"
            [class]="cls.tab"
            >Beaches</a
          >
          <a
            appTouchTarget
            routerLink="/my-bookings"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="exactPath"
            [class]="cls.tab"
            >My bookings</a
          >
        </nav>

        <div class="ml-auto flex items-center gap-1 sm:ml-3 sm:gap-2">
          <div class="relative flex items-center">
            <button
              #swatchBtn
              appTouchTarget
              type="button"
              [class]="cls.swatchBtn"
              [style.--riv-swatch]="activeTheme().swatch"
              [attr.aria-label]="'Color theme: ' + activeTheme().name"
              [attr.aria-expanded]="open() === 'theme'"
              (click)="toggle('theme')"
            ></button>

            @if (open() === 'theme') {
              <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
              <div [class]="cls.themePop">
                @for (option of themes.options; track option.id) {
                  <button
                    appTouchTarget
                    type="button"
                    [class]="cls.themeOption"
                    [attr.aria-pressed]="option.id === themes.theme()"
                    (click)="selectTheme(option.id)"
                  >
                    <span
                      class="size-[26px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]"
                      [style.background]="option.swatch"
                      aria-hidden="true"
                    ></span>
                    <span class="flex-1 text-[14px] font-semibold text-riv-pop-ink">{{
                      option.name
                    }}</span>
                    @if (option.id === themes.theme()) {
                      <span class="text-[15px] font-bold text-riv-pop-accent" aria-hidden="true"
                        >&#10003;</span
                      >
                    }
                  </button>
                }
              </div>
            }
          </div>

          @if (!customerAuth.restoring() && !customerAuth.signedIn()) {
            <a
              appTouchTarget
              routerLink="/account/sign-in"
              class="hidden items-center px-2 text-[13.5px] font-semibold text-riv-ink-soft hover:text-riv-ink aria-[current=page]:text-riv-ink aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[7px] sm:inline-flex"
              [attr.aria-current]="section() === 'account' ? 'page' : null"
              >Sign in</a
            >
          }
          <div class="relative hidden items-center sm:flex">
            <button
              #accountBtn
              appTouchTarget
              type="button"
              [class]="customerAuth.signedIn() ? cls.accountChip : cls.menuBtn"
              [attr.aria-label]="accountLabel()"
              [attr.aria-expanded]="open() === 'account'"
              (click)="toggle('account')"
            >
              @if (customerAuth.signedIn()) {
                <span [class]="cls.avatar + ' size-[26px] text-[12px]'" aria-hidden="true">{{
                  initial()
                }}</span>
                <span class="max-w-[130px] truncate">{{ handle() }}</span>
                <span class="text-[9px] opacity-85" aria-hidden="true">&#9662;</span>
              } @else {
                <svg
                  class="size-[20px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </svg>
              }
            </button>

            @if (open() === 'account') {
              <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
              <div [class]="cls.accountPop">
                @if (!customerAuth.restoring()) {
                  @if (customerAuth.signedIn()) {
                    <div class="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2.5">
                      <span [class]="cls.avatar + ' size-9 text-[15px]'" aria-hidden="true">{{
                        initial()
                      }}</span>
                      <span class="min-w-0 leading-tight">
                        <span class="block truncate text-[14px] font-bold text-riv-pop-ink">{{
                          handle()
                        }}</span>
                        <span class="block truncate text-[12px] text-riv-pop-ink-soft">{{
                          customerAuth.email()
                        }}</span>
                      </span>
                    </div>
                    <a
                      appTouchTarget
                      routerLink="/account/password"
                      routerLinkActive
                      ariaCurrentWhenActive="page"
                      [routerLinkActiveOptions]="exactPath"
                      [class]="cls.popItem"
                      (click)="close()"
                      >Your account</a
                    >
                  } @else {
                    <a
                      appTouchTarget
                      routerLink="/account/sign-in"
                      [queryParams]="{ mode: 'register' }"
                      [class]="cls.popItem"
                      (click)="close()"
                      >Create an account</a
                    >
                  }
                }
                <button
                  appTouchTarget
                  type="button"
                  [class]="cls.popBtn"
                  (click)="requestFind('account')"
                >
                  Find a booking
                </button>
                @if (customerAuth.signedIn()) {
                  <button
                    appTouchTarget
                    type="button"
                    [class]="cls.popBtn"
                    (click)="signOutRequested.emit(); close()"
                  >
                    Sign out
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </header>

    @if (open() === 'menu') {
      <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
      <div [class]="cls.sheet" data-testid="h-sheet">
        @if (!customerAuth.restoring()) {
          @if (customerAuth.signedIn()) {
            <div class="flex items-center gap-3 px-4 pt-1 pb-3">
              <span [class]="cls.avatar + ' size-10 text-[16px]'" aria-hidden="true">{{
                initial()
              }}</span>
              <span class="min-w-0 leading-tight">
                <span class="block truncate text-[15px] font-bold text-riv-pop-ink">{{
                  handle()
                }}</span>
                <span class="block truncate text-[13px] text-riv-pop-ink-soft">{{
                  customerAuth.email()
                }}</span>
              </span>
            </div>
            <a
              appTouchTarget
              routerLink="/account/password"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="cls.sheetItem"
              data-testid="h-sheet-first"
              (click)="close()"
              >Your account</a
            >
          } @else {
            <a
              appTouchTarget
              routerLink="/account/sign-in"
              [class]="cls.sheetItem + ' text-riv-pop-accent'"
              [attr.aria-current]="section() === 'account' ? 'page' : null"
              data-testid="h-sheet-first"
              (click)="close()"
              >Sign in</a
            >
            <a
              appTouchTarget
              routerLink="/account/sign-in"
              [queryParams]="{ mode: 'register' }"
              [class]="cls.sheetItem"
              (click)="close()"
              >Create an account</a
            >
          }
        }
        <button
          appTouchTarget
          type="button"
          [class]="cls.sheetItem + ' cursor-pointer'"
          data-testid="h-sheet-find"
          (click)="requestFind('menu')"
        >
          Find a booking
        </button>
        @if (customerAuth.signedIn()) {
          <button
            appTouchTarget
            type="button"
            [class]="cls.sheetItem + ' cursor-pointer'"
            (click)="signOutRequested.emit(); close()"
          >
            Sign out
          </button>
        }
      </div>
    }
  `,
})
export class HeaderVariantH {
  /** Carries the control the find modal must hand focus back to: the sheet row that opened it
   *  is gone by then, so the persistent trigger (the Menu tab, or the desktop account button). */
  readonly findRequested = output<HTMLElement>();
  readonly signOutRequested = output();

  private readonly menuTabRef = viewChild<ElementRef<HTMLButtonElement>>('menuTab');
  private readonly accountBtnRef = viewChild<ElementRef<HTMLButtonElement>>('accountBtn');
  private readonly swatchBtnRef = viewChild<ElementRef<HTMLButtonElement>>('swatchBtn');
  private readonly focusAfterRender = focusMover();

  protected readonly themes = inject(ThemeService);
  protected readonly customerAuth = inject(CustomerAuth);
  private readonly router = inject(Router);
  protected readonly exactPath = EXACT_PATH;
  protected readonly open = signal<OpenSurface>('none');

  /** The settled URL's section, read off the last successful navigation (the App's own idiom). */
  private readonly settledUrl = computed(() =>
    this.router.lastSuccessfulNavigation() === null ? '/' : this.router.url,
  );
  protected readonly section = computed(() => sectionOf(this.settledUrl()));
  /** Checkout hides the tab bar: a thumb-reach exit under the Pay button is the F objection. */
  protected readonly checkout = computed(() => this.settledUrl().startsWith('/booking/pay'));

  protected readonly cls = {
    // max-sm:relative (not static): the glass pseudo-element needs this box; phones scroll the bar away.
    header: `${GLASS_HEADER} max-sm:relative`,
    // Two layers of the header glass (0.84 / 0.92 opaque) so page prose stops bleeding through the bar.
    bottomNav:
      "fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-riv-header-border bg-riv-header-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-[22px] backdrop-saturate-[1.7] before:absolute before:inset-0 before:-z-10 before:bg-riv-header-glass before:content-[''] sm:hidden",
    tab: TAB,
    bottomTab: BOTTOM_TAB,
    bottomIcon: BOTTOM_ICON,
    swatchBtn: SWATCH_BTN,
    accountChip: ACCOUNT_CHIP,
    menuBtn: MENU_BTN,
    backdrop: BACKDROP,
    accountPop: `top-[calc(100%+8px)] right-0 w-[248px] p-[7px] ${POP}`,
    themePop: `top-[calc(100%+8px)] right-0 w-[212px] p-[7px] ${POP}`,
    themeOption: THEME_OPTION,
    popItem: POP_ITEM,
    popBtn: POP_BTN,
    sheet: `fixed inset-x-2.5 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 p-2.5 ${POP}`,
    sheetItem: SHEET_ITEM,
    avatar: AVATAR,
  } as const;

  protected readonly initial = computed(() => initialOf(this.customerAuth.email()));
  protected readonly handle = computed(() => handleOf(this.customerAuth.email()));
  protected readonly activeTheme = computed(
    () => this.themes.options.find((o) => o.id === this.themes.theme()) ?? this.themes.options[0],
  );
  protected readonly accountLabel = computed(() =>
    this.customerAuth.signedIn() ? `Account: ${this.customerAuth.email()}` : 'Menu',
  );

  protected toggle(surface: OpenSurface): void {
    const opening = this.open() !== surface;
    this.open.set(opening ? surface : 'none');
    if (opening && surface === 'menu') {
      this.focusAfterRender('h-sheet-first', 'h-sheet-find');
    }
  }

  /** Closes whichever surface is open and hands focus back to its trigger (WCAG 2.4.3): a backdrop
   *  tap or Escape otherwise strands focus on `<body>` once the surface's markup is gone. */
  protected close(): void {
    const was = this.open();
    this.open.set('none');
    const trigger =
      was === 'menu'
        ? this.menuTabRef()
        : was === 'account'
          ? this.accountBtnRef()
          : this.swatchBtnRef();
    if (was !== 'none') {
      trigger?.nativeElement.focus();
    }
  }

  /** Opens the find modal from a popover row, naming the persistent trigger as the focus-return
   *  target (the sheet and the tab bar sit in different control-flow blocks, so the class resolves
   *  the ref rather than the template). */
  protected requestFind(from: 'menu' | 'account'): void {
    const trigger = (from === 'menu' ? this.menuTabRef() : this.accountBtnRef())?.nativeElement;
    this.open.set('none');
    if (trigger) {
      this.findRequested.emit(trigger);
    }
  }

  protected selectTheme(id: ThemeId): void {
    this.themes.select(id);
  }
}

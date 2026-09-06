import { Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { CustomerAuth } from '../core/customer-auth';
import { ThemeId, ThemeService } from '../core/theme';
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

const BOTTOM_TAB =
  'flex min-h-[60px] cursor-pointer flex-col items-center justify-center gap-[3px] text-[11px] font-semibold text-riv-ink-soft aria-[current=page]:text-riv-ink aria-[current=page]:[&>span]:bg-riv-accent-fill [&_svg]:size-[21px]';

const BOTTOM_ICON =
  'grid h-7 w-12 place-items-center rounded-full [transition:background_0.15s_ease] motion-reduce:transition-none';

const SWATCH_BTN =
  'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full before:size-[22px] before:rounded-full before:bg-(image:--riv-swatch) before:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55),0_1px_3px_rgba(6,30,40,0.35)] before:[transition:scale_0.12s_ease] before:content-[""] hover:before:scale-[1.12] motion-reduce:before:transition-none motion-reduce:hover:before:scale-100';

const ACCOUNT_CHIP =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-riv-chip-border bg-riv-chip-bg px-3 text-[13.5px] font-semibold text-riv-ink backdrop-blur-[10px] [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none';

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
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <header [class]="cls.header">
      <div
        class="relative mx-auto flex h-14 w-full max-w-[1080px] items-stretch gap-3 px-4 sm:px-6"
      >
        <a class="flex min-h-11 items-center gap-2.5 text-riv-ink" routerLink="/">
          <span
            class="block size-[26px] rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_0_3px_rgba(255,255,255,0.18),0_3px_10px_rgba(240,170,46,0.5)]"
            aria-hidden="true"
          ></span>
          <span class="text-[19px] font-bold tracking-[-0.01em]">Riviera</span>
        </a>

        <nav class="ml-auto hidden items-stretch sm:flex" aria-label="Primary">
          <a
            routerLink="/"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="exactPath"
            [class]="cls.tab"
            >Beaches</a
          >
          <a
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

          <div class="relative hidden items-center sm:flex">
            <button
              appTouchTarget
              type="button"
              [class]="cls.accountChip"
              [attr.aria-label]="accountLabel()"
              [attr.aria-expanded]="open() === 'account'"
              (click)="toggle('account')"
            >
              @if (customerAuth.signedIn()) {
                <span [class]="cls.avatar + ' size-[26px] text-[12px]'" aria-hidden="true">{{
                  initial()
                }}</span>
                <span class="max-w-[130px] truncate">{{ handle() }}</span>
              } @else {
                <span>Sign in</span>
              }
              <span class="text-[9px] opacity-85" aria-hidden="true">&#9662;</span>
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
                      routerLink="/account/sign-in"
                      [class]="cls.popItem + ' text-riv-pop-accent'"
                      (click)="close()"
                      >Sign in</a
                    >
                    <a
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
                  (click)="findRequested.emit(); close()"
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

    <nav
      class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-riv-header-border bg-riv-header-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-[22px] backdrop-saturate-[1.7] sm:hidden"
      aria-label="Primary (phone)"
    >
      <a
        routerLink="/"
        routerLinkActive
        ariaCurrentWhenActive="page"
        [routerLinkActiveOptions]="exactPath"
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
        routerLink="/my-bookings"
        routerLinkActive
        ariaCurrentWhenActive="page"
        [routerLinkActiveOptions]="exactPath"
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
        appTouchTarget
        type="button"
        [class]="cls.bottomTab"
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
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          }
        </span>
        {{ customerAuth.signedIn() ? 'Account' : 'Sign in' }}
      </button>
    </nav>

    @if (open() === 'menu') {
      <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
      <div [class]="cls.sheet">
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
              routerLink="/account/password"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="cls.sheetItem"
              (click)="close()"
              >Your account</a
            >
          } @else {
            <a
              routerLink="/account/sign-in"
              [class]="cls.sheetItem + ' text-riv-pop-accent'"
              (click)="close()"
              >Sign in</a
            >
            <a
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
          (click)="findRequested.emit(); close()"
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
  readonly findRequested = output();
  readonly signOutRequested = output();

  protected readonly themes = inject(ThemeService);
  protected readonly customerAuth = inject(CustomerAuth);
  protected readonly exactPath = EXACT_PATH;
  protected readonly open = signal<OpenSurface>('none');

  protected readonly cls = {
    header: GLASS_HEADER,
    tab: TAB,
    bottomTab: BOTTOM_TAB,
    bottomIcon: BOTTOM_ICON,
    swatchBtn: SWATCH_BTN,
    accountChip: ACCOUNT_CHIP,
    backdrop: BACKDROP,
    accountPop: `top-[calc(100%+8px)] right-0 w-[248px] p-[7px] ${POP}`,
    themePop: `top-[calc(100%+8px)] right-0 w-[212px] p-[7px] ${POP}`,
    themeOption: THEME_OPTION,
    popItem: POP_ITEM,
    popBtn: POP_BTN,
    sheet: `fixed inset-x-2.5 bottom-[76px] z-40 p-2.5 ${POP}`,
    sheetItem: SHEET_ITEM,
    avatar: AVATAR,
  } as const;

  protected readonly initial = computed(() => initialOf(this.customerAuth.email()));
  protected readonly handle = computed(() => handleOf(this.customerAuth.email()));
  protected readonly activeTheme = computed(
    () => this.themes.options.find((o) => o.id === this.themes.theme()) ?? this.themes.options[0],
  );
  protected readonly accountLabel = computed(() =>
    this.customerAuth.signedIn() ? `Account: ${this.customerAuth.email()}` : 'Sign in and account',
  );

  protected toggle(surface: OpenSurface): void {
    this.open.update((current) => (current === surface ? 'none' : surface));
  }

  protected close(): void {
    this.open.set('none');
  }

  protected selectTheme(id: ThemeId): void {
    this.themes.select(id);
  }
}

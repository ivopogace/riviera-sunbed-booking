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

const LINK =
  'inline-flex min-h-11 cursor-pointer items-center text-[11.5px] font-bold tracking-[0.18em] whitespace-nowrap text-riv-ink-soft uppercase [transition:color_0.15s_ease] hover:text-riv-ink aria-[current=page]:text-riv-ink aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8';

const CONDENSE_AT = 64;
const EXPAND_AT = 8;

/**
 * PROTOTYPE variant D — "Editorial". A three-column masthead: tracked uppercase nav on the left,
 * the wordmark centred with its tagline, account + theme on the right; no chips, no pills, one
 * hairline. It rests tall and condenses on scroll (smaller wordmark, tagline gone), so the page
 * keeps the room. Phones get a hamburger sheet on the left and the account on the right.
 */
@Component({
  selector: 'app-header-variant-d',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: {
    class: 'contents',
    '(document:keydown.escape)': 'close()',
    '(window:scroll)': 'onScroll()',
  },
  template: `
    <header [class]="cls.header">
      <div
        class="relative mx-auto grid w-full max-w-[1080px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 [transition:padding_0.2s_ease] sm:px-6 motion-reduce:transition-none"
        [class]="condensed() ? 'py-1' : 'py-3.5'"
      >
        <nav class="hidden items-center gap-7 sm:flex" aria-label="Primary">
          <a
            routerLink="/"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="exactPath"
            [class]="cls.link"
            >Beaches</a
          >
          <a
            routerLink="/my-bookings"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="exactPath"
            [class]="cls.link"
            >My bookings</a
          >
          <button appTouchTarget type="button" [class]="cls.link" (click)="findRequested.emit()">
            Find a booking
          </button>
        </nav>

        <div class="relative flex items-center sm:hidden">
          <button
            appTouchTarget
            type="button"
            class="flex size-11 cursor-pointer flex-col items-center justify-center gap-[4.5px] rounded-full text-riv-ink hover:bg-riv-chip-bg"
            aria-label="Menu"
            [attr.aria-expanded]="open() === 'menu'"
            (click)="toggle('menu')"
          >
            <span class="block h-0.5 w-[18px] rounded-[2px] bg-current" aria-hidden="true"></span>
            <span class="block h-0.5 w-[18px] rounded-[2px] bg-current" aria-hidden="true"></span>
            <span class="block h-0.5 w-[18px] rounded-[2px] bg-current" aria-hidden="true"></span>
          </button>
          @if (open() === 'menu') {
            <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
            <nav [class]="cls.sheet" aria-label="Menu">
              <a
                routerLink="/"
                routerLinkActive
                ariaCurrentWhenActive="page"
                [routerLinkActiveOptions]="exactPath"
                [class]="cls.sheetItem"
                (click)="close()"
                >Beaches</a
              >
              <a
                routerLink="/my-bookings"
                routerLinkActive
                ariaCurrentWhenActive="page"
                [routerLinkActiveOptions]="exactPath"
                [class]="cls.sheetItem"
                (click)="close()"
                >My bookings</a
              >
              <button
                appTouchTarget
                type="button"
                [class]="cls.sheetItem + ' cursor-pointer'"
                (click)="findRequested.emit(); close()"
              >
                Find a booking
              </button>
              @if (!customerAuth.restoring() && !customerAuth.signedIn()) {
                <a
                  routerLink="/account/sign-in"
                  [class]="cls.sheetItem + ' text-riv-pop-accent'"
                  (click)="close()"
                  >Sign in or register</a
                >
              }
            </nav>
          }
        </div>

        <a
          class="flex min-h-11 items-center gap-2.5 justify-self-center text-riv-ink"
          routerLink="/"
        >
          <span
            class="block rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_0_3px_rgba(255,255,255,0.18),0_3px_10px_rgba(240,170,46,0.5)] [transition:width_0.2s_ease,height_0.2s_ease] motion-reduce:transition-none"
            [class]="condensed() ? 'size-[18px]' : 'size-7'"
            aria-hidden="true"
          ></span>
          <span class="flex flex-col items-start leading-none">
            <span
              class="font-bold tracking-[-0.02em] [transition:font-size_0.2s_ease] motion-reduce:transition-none"
              [class]="condensed() ? 'text-[19px]' : 'text-[26px]'"
              >Riviera</span
            >
            @if (!condensed()) {
              <span class="mt-1.5 text-[10px] tracking-[0.28em] text-riv-ink-faint uppercase"
                >Albanian Coast</span
              >
            }
          </span>
        </a>

        <div class="flex items-center justify-end gap-1">
          @if (!customerAuth.restoring()) {
            @if (customerAuth.signedIn()) {
              <div class="relative flex items-center">
                <button
                  appTouchTarget
                  type="button"
                  class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-1.5 text-riv-ink hover:bg-riv-chip-bg"
                  [attr.aria-label]="'Account: ' + customerAuth.email()"
                  [attr.aria-expanded]="open() === 'account'"
                  (click)="toggle('account')"
                >
                  <span [class]="cls.avatar + ' size-[30px] text-[13px]'" aria-hidden="true">{{
                    initial()
                  }}</span>
                  <span
                    class="hidden max-w-[120px] truncate text-[11.5px] font-bold tracking-[0.18em] uppercase md:inline"
                    >{{ handle() }}</span
                  >
                </button>
                @if (open() === 'account') {
                  <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
                  <div [class]="cls.accountPop">
                    <p class="m-0 truncate px-2.5 pt-1.5 pb-2 text-[12px] text-riv-pop-ink-soft">
                      {{ customerAuth.email() }}
                    </p>
                    <a
                      routerLink="/account/password"
                      routerLinkActive
                      ariaCurrentWhenActive="page"
                      [routerLinkActiveOptions]="exactPath"
                      [class]="cls.popItem"
                      (click)="close()"
                      >Your account</a
                    >
                    <button
                      appTouchTarget
                      type="button"
                      [class]="cls.popBtn"
                      (click)="signOutRequested.emit(); close()"
                    >
                      Sign out
                    </button>
                  </div>
                }
              </div>
            } @else {
              <a routerLink="/account/sign-in" [class]="cls.link + ' px-1.5 max-sm:hidden'"
                >Sign in</a
              >
            }
          }

          <div class="relative flex items-center">
            <button
              appTouchTarget
              type="button"
              class="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-riv-chip-bg"
              [attr.aria-label]="'Color theme: ' + activeTheme().name"
              [attr.aria-expanded]="open() === 'theme'"
              (click)="toggle('theme')"
            >
              <span
                class="size-4 rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.55),0_0_0_2px_var(--riv-chip-border)]"
                [style.background]="activeTheme().swatch"
                aria-hidden="true"
              ></span>
            </button>
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
        </div>
      </div>
    </header>
  `,
})
export class HeaderVariantD {
  readonly findRequested = output();
  readonly signOutRequested = output();

  protected readonly themes = inject(ThemeService);
  protected readonly customerAuth = inject(CustomerAuth);
  protected readonly exactPath = EXACT_PATH;
  protected readonly open = signal<OpenSurface>('none');
  protected readonly condensed = signal(false);

  protected readonly cls = {
    header: GLASS_HEADER,
    link: LINK,
    backdrop: BACKDROP,
    sheet: `top-[calc(100%+8px)] left-0 w-[min(320px,calc(100vw-32px))] p-2 ${POP}`,
    sheetItem: SHEET_ITEM,
    themePop: `top-[calc(100%+10px)] right-0 w-[214px] p-[7px] ${POP}`,
    accountPop: `top-[calc(100%+10px)] right-0 w-[220px] p-[7px] ${POP}`,
    themeOption: THEME_OPTION,
    popItem: POP_ITEM,
    popBtn: POP_BTN,
    avatar: AVATAR,
  } as const;

  protected readonly activeTheme = computed(
    () =>
      this.themes.options.find((option) => option.id === this.themes.theme()) ??
      this.themes.options[0],
  );
  protected readonly initial = computed(() => initialOf(this.customerAuth.email()));
  protected readonly handle = computed(() => handleOf(this.customerAuth.email()));

  protected onScroll(): void {
    const y = window.scrollY;
    if (y > CONDENSE_AT) {
      this.condensed.set(true);
    } else if (y < EXPAND_AT) {
      this.condensed.set(false);
    }
  }

  protected toggle(surface: OpenSurface): void {
    this.open.update((current) => (current === surface ? 'none' : surface));
  }

  protected close(): void {
    this.open.set('none');
  }

  protected selectTheme(id: ThemeId): void {
    this.themes.select(id);
    this.close();
  }
}

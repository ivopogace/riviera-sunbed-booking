import { Component, computed, inject, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
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
  THEME_OPTION,
  handleOf,
  initialOf,
} from './prototype-header-support';

const RAIL_ITEM =
  'flex w-full min-h-[64px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl text-[10.5px] font-bold tracking-[0.06em] text-riv-ink-soft uppercase [transition:background_0.15s_ease,color_0.15s_ease] hover:bg-riv-chip-bg hover:text-riv-ink aria-[current=page]:bg-riv-accent-fill aria-[current=page]:text-riv-ink [&_svg]:size-[22px]';

const BOTTOM_TAB =
  'flex min-h-[60px] cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-semibold text-riv-ink-soft aria-[current=page]:text-riv-ink [&_svg]:size-[22px]';

/**
 * PROTOTYPE variant G — "Side rail". No top bar on desktop: a fixed 88px glass rail on the left
 * carries the sun, a rotated wordmark, the icon-over-label nav, and the theme + account at the
 * foot, so the whole page width above the fold belongs to the content. Below `md` the rail folds
 * into a slim top bar (brand + account) plus a bottom tab bar.
 */
@Component({
  selector: 'app-header-variant-g',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, TouchTarget],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <aside
      class="fixed inset-y-0 left-0 z-20 hidden w-[88px] flex-col items-center border-r border-riv-header-border bg-riv-header-glass px-2.5 py-4 backdrop-blur-[22px] backdrop-saturate-[1.7] md:flex"
    >
      <a class="flex min-h-11 flex-col items-center gap-3 text-riv-ink" routerLink="/">
        <span
          class="block size-9 rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_0_4px_rgba(255,255,255,0.18),0_4px_14px_rgba(240,170,46,0.5)]"
          aria-hidden="true"
        ></span>
        <span
          class="text-[15px] font-bold tracking-[0.14em] uppercase [writing-mode:vertical-rl] rotate-180"
          >Riviera</span
        >
      </a>

      <nav class="mt-8 flex w-full flex-col gap-1.5" aria-label="Primary">
        <a
          routerLink="/"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="exactPath"
          [class]="cls.railItem"
        >
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
          Beaches
        </a>
        <a
          routerLink="/my-bookings"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="exactPath"
          [class]="cls.railItem"
        >
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
          Bookings
        </a>
        <button appTouchTarget type="button" [class]="cls.railItem" (click)="findRequested.emit()">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Find
        </button>
      </nav>

      <div class="mt-auto flex w-full flex-col items-center gap-1.5">
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
              class="size-[18px] rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55),0_0_0_1px_var(--riv-chip-border)]"
              [style.background]="activeTheme().swatch"
              aria-hidden="true"
            ></span>
          </button>
          @if (open() === 'theme') {
            <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
            <div [class]="cls.railPop">
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
                </button>
              }
            </div>
          }
        </div>

        <div class="relative flex items-center">
          <button
            appTouchTarget
            type="button"
            class="grid size-11 cursor-pointer place-items-center rounded-full text-riv-ink hover:bg-riv-chip-bg"
            [attr.aria-label]="accountLabel()"
            [attr.aria-expanded]="open() === 'account'"
            (click)="toggle('account')"
          >
            @if (customerAuth.signedIn()) {
              <span [class]="cls.avatar + ' size-9 text-[15px]'" aria-hidden="true">{{
                initial()
              }}</span>
            } @else {
              <svg
                class="size-[22px]"
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
          </button>
          @if (open() === 'account') {
            <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
            <div [class]="cls.railPop">
              <ng-container *ngTemplateOutlet="accountRows" />
            </div>
          }
        </div>
      </div>
    </aside>

    <header [class]="cls.header + ' md:hidden'">
      <div class="relative flex h-14 w-full items-center gap-3 px-4">
        <a class="flex min-h-11 items-center gap-2.5 text-riv-ink" routerLink="/">
          <span
            class="block size-[26px] rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_0_3px_rgba(255,255,255,0.18),0_3px_10px_rgba(240,170,46,0.5)]"
            aria-hidden="true"
          ></span>
          <span class="text-[19px] font-bold tracking-[-0.01em]">Riviera</span>
        </a>
        <div class="relative ml-auto flex items-center">
          <button
            appTouchTarget
            type="button"
            class="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-riv-chip-border bg-riv-chip-bg text-riv-ink backdrop-blur-[10px]"
            [attr.aria-label]="accountLabel()"
            [attr.aria-expanded]="open() === 'phone-account'"
            (click)="toggle('phone-account')"
          >
            @if (customerAuth.signedIn()) {
              <span [class]="cls.avatar + ' size-[30px] text-[13px]'" aria-hidden="true">{{
                initial()
              }}</span>
            } @else {
              <svg
                class="size-[20px]"
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
          </button>
          @if (open() === 'phone-account') {
            <div [class]="cls.backdrop" (click)="close()" aria-hidden="true"></div>
            <div [class]="cls.phonePop">
              <ng-container *ngTemplateOutlet="accountRows" />
              <div class="mt-1 border-t border-riv-pop-divider px-2.5 pt-2.5 pb-1.5">
                <span
                  class="text-[10.5px] font-bold tracking-[0.12em] text-riv-pop-ink-soft uppercase"
                  >Color theme</span
                >
                <div class="mt-2 flex gap-1.5">
                  @for (option of themes.options; track option.id) {
                    <button
                      appTouchTarget
                      type="button"
                      class="grid size-11 cursor-pointer place-items-center before:size-[28px] before:rounded-full before:bg-(image:--riv-swatch) before:content-['']"
                      [class]="
                        option.id === themes.theme()
                          ? 'before:shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#0e8aa8]'
                          : 'before:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]'
                      "
                      [style.--riv-swatch]="option.swatch"
                      [attr.aria-pressed]="option.id === themes.theme()"
                      [attr.aria-label]="option.name"
                      [title]="option.name"
                      (click)="selectTheme(option.id)"
                    ></button>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    </header>

    <nav
      class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-riv-header-border bg-riv-header-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-[22px] backdrop-saturate-[1.7] md:hidden"
      aria-label="Primary (phone)"
    >
      <a
        routerLink="/"
        routerLinkActive
        ariaCurrentWhenActive="page"
        [routerLinkActiveOptions]="exactPath"
        [class]="cls.bottomTab"
      >
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
        Beaches
      </a>
      <a
        routerLink="/my-bookings"
        routerLinkActive
        ariaCurrentWhenActive="page"
        [routerLinkActiveOptions]="exactPath"
        [class]="cls.bottomTab"
      >
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
        My bookings
      </a>
      <button appTouchTarget type="button" [class]="cls.bottomTab" (click)="findRequested.emit()">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        Find a booking
      </button>
    </nav>

    <ng-template #accountRows>
      @if (!customerAuth.restoring()) {
        @if (customerAuth.signedIn()) {
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
    </ng-template>
  `,
})
export class HeaderVariantG {
  readonly findRequested = output();
  readonly signOutRequested = output();

  protected readonly themes = inject(ThemeService);
  protected readonly customerAuth = inject(CustomerAuth);
  protected readonly exactPath = EXACT_PATH;
  protected readonly open = signal<OpenSurface | 'phone-account'>('none');

  protected readonly cls = {
    header: GLASS_HEADER,
    railItem: RAIL_ITEM,
    bottomTab: BOTTOM_TAB,
    backdrop: BACKDROP,
    railPop: `bottom-0 left-[calc(100%+14px)] w-[230px] p-[7px] ${POP}`,
    phonePop: `top-[calc(100%+8px)] right-0 w-[240px] p-[7px] ${POP}`,
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
  protected readonly accountLabel = computed(() =>
    this.customerAuth.signedIn() ? `Account: ${this.customerAuth.email()}` : 'Account',
  );

  protected toggle(surface: OpenSurface | 'phone-account'): void {
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

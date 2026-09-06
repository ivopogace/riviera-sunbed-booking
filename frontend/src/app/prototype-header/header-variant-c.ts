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
  handleOf,
  initialOf,
} from './prototype-header-support';

const TAB =
  'relative inline-flex h-full min-h-11 cursor-pointer items-center gap-1.5 px-3 text-[13px] font-semibold text-riv-ink-soft [transition:color_0.15s_ease] hover:text-riv-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-current after:opacity-0 after:content-[""] aria-[current=page]:text-riv-ink aria-[current=page]:after:opacity-100 [&_svg]:size-[17px] [&_svg]:shrink-0';

const BOTTOM_TAB =
  'flex min-h-[60px] cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-semibold text-riv-ink-soft aria-[current=page]:text-riv-ink [&_svg]:size-[22px]';

/**
 * PROTOTYPE variant C — "App bar". A compact 56px bar: brand shrunk to sun + wordmark, icon+label
 * nav on the right with an accent underline on the current page, and ONE account button that
 * holds sign-in/register or the account rows plus the theme swatches (the theme leaves the bar).
 * On phones the nav becomes a fixed bottom tab bar, like a native app.
 */
@Component({
  selector: 'app-header-variant-c',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <header [class]="cls.header">
      <div
        class="relative mx-auto flex h-14 w-full max-w-[1080px] items-stretch gap-4 px-4 sm:px-6"
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
            [class]="cls.tab"
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
          <button appTouchTarget type="button" [class]="cls.tab" (click)="findRequested.emit()">
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

        <span
          class="my-auto hidden h-6 w-px bg-riv-header-border sm:block"
          aria-hidden="true"
        ></span>

        <div class="relative ml-auto flex items-center sm:ml-0">
          <button
            appTouchTarget
            type="button"
            class="inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-riv-chip-border bg-riv-chip-bg text-riv-ink backdrop-blur-[10px] [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none"
            [attr.aria-label]="accountLabel()"
            [attr.aria-expanded]="open() === 'account'"
            (click)="toggle('account')"
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
  `,
})
export class HeaderVariantC {
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
    backdrop: BACKDROP,
    accountPop: `top-[calc(100%+8px)] right-0 w-[240px] p-[7px] ${POP}`,
    popItem: POP_ITEM,
    popBtn: POP_BTN,
    avatar: AVATAR,
  } as const;

  protected readonly initial = computed(() => initialOf(this.customerAuth.email()));
  protected readonly handle = computed(() => handleOf(this.customerAuth.email()));
  protected readonly accountLabel = computed(() =>
    this.customerAuth.signedIn() ? `Account: ${this.customerAuth.email()}` : 'Account and theme',
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

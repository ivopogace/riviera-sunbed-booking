import { Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { CustomerAuth } from '../core/customer-auth';
import { ThemeId, ThemeService } from '../core/theme';
import { TouchTarget } from '../shared/touch-target';
import {
  AVATAR,
  BACKDROP,
  CTA,
  EXACT_PATH,
  OpenSurface,
  POP,
  POP_BTN,
  POP_ITEM,
  THEME_OPTION,
  handleOf,
  initialOf,
} from './prototype-header-support';

const LINK =
  'inline-flex min-h-11 cursor-pointer items-center rounded-full px-3.5 text-[13.5px] font-semibold whitespace-nowrap text-riv-card-ink-soft [transition:background_0.15s_ease,color_0.15s_ease] hover:text-riv-card-ink aria-[current=page]:bg-riv-accent-fill aria-[current=page]:text-riv-accent-ink';

const SHEET_ROW =
  'flex w-full min-h-11 cursor-pointer items-center rounded-2xl px-4 text-[15.5px] font-semibold text-riv-card-ink hover:bg-riv-accent-fill aria-[current=page]:bg-riv-accent-fill aria-[current=page]:text-riv-accent-ink';

/**
 * PROTOTYPE variant E — "Floating capsule". There is no header bar: a rounded glass capsule floats
 * a few pixels below the top edge, on the card-glass tokens, with the animated background showing
 * all around it. Nav links sit inside it, the current one a tinted pill. On phones the capsule
 * carries the brand, the avatar and a menu button, and morphs into a panel when tapped.
 */
@Component({
  selector: 'app-header-variant-e',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="sticky top-2.5 z-20 px-3 sm:top-3.5 sm:px-6">
      <div
        class="relative mx-auto flex w-full max-w-[1000px] flex-wrap items-center gap-x-2 border border-riv-card-border bg-riv-card-glass px-2 py-1.5 text-riv-card-ink shadow-[0_14px_44px_rgba(7,42,58,0.26),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-[28px] backdrop-saturate-[1.7] [transition:border-radius_0.2s_ease] motion-reduce:transition-none"
        [class]="open() === 'menu' ? 'rounded-[28px]' : 'rounded-full'"
      >
        <a class="flex min-h-11 items-center gap-2.5 pl-2 text-riv-card-ink" routerLink="/">
          <span
            class="block size-7 rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_0_3px_rgba(255,255,255,0.18),0_3px_10px_rgba(240,170,46,0.5)]"
            aria-hidden="true"
          ></span>
          <span class="text-[19px] font-bold tracking-[-0.01em]">Riviera</span>
        </a>

        <nav class="mx-auto hidden items-center gap-0.5 sm:flex" aria-label="Primary">
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

        <div class="ml-auto flex items-center gap-1 sm:ml-0">
          <div class="relative flex items-center">
            <button
              appTouchTarget
              type="button"
              class="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-riv-accent-fill"
              [attr.aria-label]="'Color theme: ' + activeTheme().name"
              [attr.aria-expanded]="open() === 'theme'"
              (click)="toggle('theme')"
            >
              <span
                class="size-[18px] rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55),0_0_0_1px_var(--riv-field-border)]"
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
                  </button>
                }
              </div>
            }
          </div>

          @if (!customerAuth.restoring()) {
            @if (customerAuth.signedIn()) {
              <div class="relative flex items-center">
                <button
                  appTouchTarget
                  type="button"
                  class="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-riv-accent-fill"
                  [attr.aria-label]="'Account: ' + customerAuth.email()"
                  [attr.aria-expanded]="open() === 'account'"
                  (click)="toggle('account')"
                >
                  <span [class]="cls.avatar + ' size-[34px] text-[14px]'" aria-hidden="true">{{
                    initial()
                  }}</span>
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
              <a routerLink="/account/sign-in" [class]="cls.cta + ' ml-1'">Sign in</a>
            }
          }

          <button
            appTouchTarget
            type="button"
            class="flex size-11 cursor-pointer flex-col items-center justify-center gap-[4.5px] rounded-full hover:bg-riv-accent-fill sm:hidden"
            aria-label="Menu"
            [attr.aria-expanded]="open() === 'menu'"
            (click)="toggle('menu')"
          >
            <span class="block h-0.5 w-[17px] rounded-[2px] bg-current" aria-hidden="true"></span>
            <span class="block h-0.5 w-[17px] rounded-[2px] bg-current" aria-hidden="true"></span>
            <span class="block h-0.5 w-[17px] rounded-[2px] bg-current" aria-hidden="true"></span>
          </button>
        </div>

        @if (open() === 'menu') {
          <nav
            class="mt-1.5 flex basis-full flex-col gap-0.5 border-t border-riv-pop-divider pt-2 pb-1 sm:hidden"
            aria-label="Menu"
          >
            <a
              routerLink="/"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="cls.sheetRow"
              (click)="close()"
              >Beaches</a
            >
            <a
              routerLink="/my-bookings"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="cls.sheetRow"
              (click)="close()"
              >My bookings</a
            >
            <button
              appTouchTarget
              type="button"
              [class]="cls.sheetRow"
              (click)="findRequested.emit(); close()"
            >
              Find a booking
            </button>
          </nav>
        }
      </div>
    </div>
  `,
})
export class HeaderVariantE {
  readonly findRequested = output();
  readonly signOutRequested = output();

  protected readonly themes = inject(ThemeService);
  protected readonly customerAuth = inject(CustomerAuth);
  protected readonly exactPath = EXACT_PATH;
  protected readonly open = signal<OpenSurface>('none');

  protected readonly cls = {
    link: LINK,
    sheetRow: SHEET_ROW,
    backdrop: BACKDROP,
    themePop: `top-[calc(100%+12px)] right-0 w-[214px] p-[7px] ${POP}`,
    accountPop: `top-[calc(100%+12px)] right-0 w-[220px] p-[7px] ${POP}`,
    themeOption: THEME_OPTION,
    popItem: POP_ITEM,
    popBtn: POP_BTN,
    avatar: AVATAR,
    cta: CTA,
  } as const;

  protected readonly activeTheme = computed(
    () =>
      this.themes.options.find((option) => option.id === this.themes.theme()) ??
      this.themes.options[0],
  );
  protected readonly initial = computed(() => initialOf(this.customerAuth.email()));
  protected readonly handle = computed(() => handleOf(this.customerAuth.email()));

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

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
  GLASS_HEADER,
  OpenSurface,
  POP,
  POP_BTN,
  POP_ITEM,
  THEME_OPTION,
  handleOf,
  initialOf,
} from './prototype-header-support';

const PILL =
  'inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-full px-2.5 text-[13.5px] font-semibold whitespace-nowrap text-riv-ink-soft [transition:background_0.15s_ease,color_0.15s_ease] hover:text-riv-ink sm:flex-none sm:px-4 aria-[current=page]:bg-riv-pop-surface aria-[current=page]:text-riv-pop-accent aria-[current=page]:shadow-[0_2px_10px_rgba(6,30,40,0.18)]';

const ROUND_CHIP =
  'inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-riv-chip-border bg-riv-chip-bg backdrop-blur-[10px] [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none';

/**
 * PROTOTYPE variant B — "Pill tabs". The nav is a segmented glass pill in the middle of the bar,
 * the current page a raised white tab; the theme picker shrinks to a swatch button; Sign in becomes
 * the one gradient CTA; a signed-in guest is an avatar chip. On phones the pill drops to a second
 * full-width row, so there is no hamburger at all.
 */
@Component({
  selector: 'app-header-variant-b',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <header [class]="cls.header">
      <div
        class="relative mx-auto flex w-full max-w-[1080px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6"
      >
        <a class="flex min-h-11 items-center gap-3 text-riv-ink" routerLink="/">
          <span
            class="block size-8 rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_0_4px_rgba(255,255,255,0.18),0_4px_14px_rgba(240,170,46,0.5)]"
            aria-hidden="true"
          ></span>
          <span class="flex flex-col leading-none">
            <span class="text-[21px] font-bold tracking-[-0.01em]">Riviera</span>
            <span class="mt-1 text-[10px] tracking-[0.24em] text-riv-ink-faint uppercase"
              >Albanian Coast</span
            >
          </span>
        </a>

        <nav class="order-last w-full sm:order-none sm:mx-auto sm:w-auto" aria-label="Primary">
          <div
            class="flex w-full items-center gap-0.5 rounded-full border border-riv-chip-border bg-riv-chip-bg p-[3px] backdrop-blur-[10px] sm:w-auto"
          >
            <a
              routerLink="/"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="cls.pill"
              >Beaches</a
            >
            <a
              routerLink="/my-bookings"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="cls.pill"
              >My bookings</a
            >
            <button appTouchTarget type="button" [class]="cls.pill" (click)="findRequested.emit()">
              Find a booking
            </button>
          </div>
        </nav>

        <div class="ml-auto flex items-center gap-2 sm:ml-0">
          <div class="relative flex items-center">
            <button
              appTouchTarget
              type="button"
              [class]="cls.roundChip"
              [attr.aria-label]="'Color theme: ' + activeTheme().name"
              [attr.aria-expanded]="open() === 'theme'"
              (click)="toggle('theme')"
            >
              <span
                class="size-[18px] rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]"
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

          @if (!customerAuth.restoring()) {
            @if (customerAuth.signedIn()) {
              <div class="relative flex items-center">
                <button
                  appTouchTarget
                  type="button"
                  class="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-riv-chip-border bg-riv-chip-bg py-1 pr-3 pl-1 text-riv-ink backdrop-blur-[10px] [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none"
                  [attr.aria-label]="'Account: ' + customerAuth.email()"
                  [attr.aria-expanded]="open() === 'account'"
                  (click)="toggle('account')"
                >
                  <span [class]="cls.avatar + ' size-[34px] text-[14px]'" aria-hidden="true">{{
                    initial()
                  }}</span>
                  <span
                    class="hidden max-w-[140px] truncate text-[13.5px] font-semibold sm:inline"
                    >{{ handle() }}</span
                  >
                  <span class="text-[9px] opacity-85" aria-hidden="true">&#9662;</span>
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
              <a
                routerLink="/account/sign-in"
                [queryParams]="{ mode: 'register' }"
                class="hidden min-h-11 items-center px-2 text-[13.5px] font-semibold text-riv-ink-soft hover:text-riv-ink sm:inline-flex"
                >Register</a
              >
              <a routerLink="/account/sign-in" [class]="cls.cta">Sign in</a>
            }
          }
        </div>
      </div>
    </header>
  `,
})
export class HeaderVariantB {
  readonly findRequested = output();
  readonly signOutRequested = output();

  protected readonly themes = inject(ThemeService);
  protected readonly customerAuth = inject(CustomerAuth);
  protected readonly exactPath = EXACT_PATH;
  protected readonly open = signal<OpenSurface>('none');

  protected readonly cls = {
    header: GLASS_HEADER,
    pill: PILL,
    roundChip: ROUND_CHIP,
    backdrop: BACKDROP,
    themePop: `top-[calc(100%+10px)] right-0 w-[214px] p-[7px] ${POP}`,
    accountPop: `top-[calc(100%+10px)] right-0 w-[220px] p-[7px] ${POP}`,
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

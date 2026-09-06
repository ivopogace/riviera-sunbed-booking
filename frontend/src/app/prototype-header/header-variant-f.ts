import { Component, computed, inject, output, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

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

const ICON_BTN =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold text-riv-ink-soft hover:bg-riv-chip-bg hover:text-riv-ink aria-[current=page]:bg-riv-chip-bg aria-[current=page]:text-riv-ink [&_svg]:size-[19px] [&_svg]:shrink-0';

/**
 * PROTOTYPE variant F — "Search-first". The header IS the search: a field-shaped pill in the
 * middle ("Where to? · Any date" with a go button) that takes the guest to Discover and focuses
 * the beach filter. Everything else shrinks: My bookings is an icon-and-label, Find a booking and
 * the theme swatches live in the account menu with sign-in/register. One row on every width.
 */
@Component({
  selector: 'app-header-variant-f',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <header [class]="cls.header">
      <div
        class="relative mx-auto flex w-full max-w-[1080px] items-center gap-2 px-3 py-2.5 sm:gap-4 sm:px-6"
      >
        <a class="flex min-h-11 shrink-0 items-center gap-2.5 text-riv-ink" routerLink="/">
          <span
            class="block size-8 rounded-full bg-(image:--riv-sun-grad) shadow-[0_0_0_4px_rgba(255,255,255,0.18),0_4px_14px_rgba(240,170,46,0.5)]"
            aria-hidden="true"
          ></span>
          <span class="hidden text-[19px] font-bold tracking-[-0.01em] md:inline">Riviera</span>
        </a>

        <button
          appTouchTarget
          type="button"
          class="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full border border-riv-field-border bg-riv-field-fill py-1 pr-1 pl-4 text-left text-riv-ink shadow-[0_6px_20px_rgba(7,42,58,0.12),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-[14px] [transition:box-shadow_0.15s_ease] hover:shadow-[0_10px_28px_rgba(7,42,58,0.18),inset_0_1px_0_rgba(255,255,255,0.6)] sm:mx-auto sm:max-w-[520px] motion-reduce:transition-none"
          aria-label="Search beaches: where to, and which date"
          (click)="search()"
        >
          <span class="min-w-0 flex-1 truncate text-[14px] font-semibold">Where to?</span>
          <span
            class="hidden h-5 w-px shrink-0 bg-riv-field-border sm:block"
            aria-hidden="true"
          ></span>
          <span class="hidden shrink-0 text-[13px] text-riv-ink-soft sm:inline">Any date</span>
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full border border-riv-cta-border bg-(image:--riv-cta-grad) text-white shadow-[0_4px_12px_rgba(11,120,150,0.4)]"
            aria-hidden="true"
          >
            <svg
              class="size-[17px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
        </button>

        <div class="flex shrink-0 items-center gap-1">
          <a
            routerLink="/my-bookings"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [routerLinkActiveOptions]="exactPath"
            [class]="cls.iconBtn"
            aria-label="My bookings"
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
            <span class="hidden lg:inline">My bookings</span>
          </a>

          <div class="relative flex items-center">
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
                  Find a booking by code
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
      </div>
    </header>
  `,
})
export class HeaderVariantF {
  readonly findRequested = output();
  readonly signOutRequested = output();

  protected readonly themes = inject(ThemeService);
  protected readonly customerAuth = inject(CustomerAuth);
  private readonly router = inject(Router);
  protected readonly exactPath = EXACT_PATH;
  protected readonly open = signal<OpenSurface>('none');

  protected readonly cls = {
    header: GLASS_HEADER,
    iconBtn: ICON_BTN,
    backdrop: BACKDROP,
    accountPop: `top-[calc(100%+8px)] right-0 w-[240px] p-[7px] ${POP}`,
    popItem: POP_ITEM,
    popBtn: POP_BTN,
    avatar: AVATAR,
  } as const;

  protected readonly initial = computed(() => initialOf(this.customerAuth.email()));
  protected readonly handle = computed(() => handleOf(this.customerAuth.email()));
  protected readonly accountLabel = computed(() =>
    this.customerAuth.signedIn() ? `Account: ${this.customerAuth.email()}` : 'Menu',
  );

  protected async search(): Promise<void> {
    await this.router.navigateByUrl('/');
    document.getElementById('filter-beach')?.focus();
  }

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

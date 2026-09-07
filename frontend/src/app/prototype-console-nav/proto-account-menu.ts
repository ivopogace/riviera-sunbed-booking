import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { PrototypeConsoleTheme } from './prototype-console-theme';
import { TouchTarget } from '../shared/touch-target';
import {
  AVATAR,
  BACKDROP,
  CHIP_BTN,
  EXACT_PATH,
  POP,
  POP_BTN,
  POP_ITEM,
  handleOf,
  initialOf,
} from './console-nav-support';

/**
 * PROTOTYPE — the account disclosure every candidate shares: one avatar chip holding what the
 * shipped chrome spreads across the bar as five peers (Create a venue · Admin · Change password ·
 * Signed in as · Sign out). The grilling question "does `Signed in as <email>` deserve bar space
 * next to Requests?" is answered here by demotion; the `current` baseline keeps the flat row.
 *
 * <p>`placement` says which way the popover opens: `down` under a top bar, `up` from a sidebar
 * footer. `showAdmin` lets a variant that already routes Admin elsewhere (the one-shell `d`, the
 * sidebar `c`) drop the duplicate row.
 */
@Component({
  selector: 'app-proto-account-menu',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: { class: 'relative flex items-center', '(document:keydown.escape)': 'close()' },
  template: `
    @if (!operator.restoring()) {
      @if (operator.signedIn()) {
        <button
          appTouchTarget
          type="button"
          [class]="chip()"
          [attr.aria-label]="'Account: ' + operator.username()"
          [attr.aria-expanded]="open()"
          data-testid="proto-account"
          (click)="open.set(!open())"
        >
          <span [class]="avatar + ' size-[26px] text-[12px]'" aria-hidden="true">{{
            initial()
          }}</span>
          @if (!compact()) {
            <span class="max-w-[120px] truncate max-sm:hidden">{{ handle() }}</span>
          }
          <span class="text-[9px] opacity-85" aria-hidden="true">&#9662;</span>
        </button>
        @if (open()) {
          <div [class]="backdrop" (click)="close()" aria-hidden="true"></div>
          <div [class]="pop()" data-testid="proto-account-menu">
            <div class="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2.5">
              <span [class]="avatar + ' size-9 text-[15px]'" aria-hidden="true">{{
                initial()
              }}</span>
              <span class="min-w-0 leading-tight">
                <span class="block truncate text-[14px] font-bold text-riv-pop-ink">{{
                  handle()
                }}</span>
                <span class="block truncate text-[12px] text-riv-pop-ink-soft"
                  >Signed in as {{ operator.username() }}</span
                >
              </span>
            </div>
            @if (showAdmin() && operator.isAdmin()) {
              <a
                appTouchTarget
                routerLink="/admin"
                routerLinkActive
                ariaCurrentWhenActive="page"
                [class]="popItem"
                (click)="close()"
                >Admin console</a
              >
            }
            @if (!minimal()) {
              <a
                appTouchTarget
                routerLink="/operator"
                [queryParams]="{ create: '1' }"
                [class]="popItem"
                (click)="close()"
                >Create a venue</a
              >
            }
            <a
              appTouchTarget
              routerLink="/account/operator-password"
              routerLinkActive
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="exactPath"
              [class]="popItem"
              (click)="close()"
              >Change password</a
            >
            @if (themeSwitch()) {
              <p
                class="mt-1 border-t border-riv-pop-divider px-2.5 pt-2.5 pb-1 text-[11px] font-bold tracking-[0.14em] text-riv-pop-ink-soft uppercase"
              >
                Console theme
              </p>
              @for (option of consoleTheme.options; track option.id) {
                <button
                  appTouchTarget
                  type="button"
                  [class]="popBtn"
                  [attr.aria-pressed]="option.id === consoleTheme.theme()"
                  [attr.data-testid]="'proto-theme-' + option.id"
                  (click)="consoleTheme.select(option.id)"
                >
                  <span
                    class="size-[22px] shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]"
                    [style.background]="option.swatch"
                    aria-hidden="true"
                  ></span>
                  <span class="flex-1">{{ option.name }}</span>
                  @if (option.id === consoleTheme.theme()) {
                    <span class="text-[15px] font-bold text-riv-pop-accent" aria-hidden="true"
                      >&#10003;</span
                    >
                  }
                </button>
              }
            }
            <button
              appTouchTarget
              type="button"
              [class]="popBtn"
              data-testid="proto-signout"
              (click)="close(); signOut.emit()"
            >
              Sign out
            </button>
          </div>
        }
      } @else {
        <a
          appTouchTarget
          class="inline-flex items-center text-[13px] font-semibold text-riv-ink no-underline hover:underline"
          routerLink="/account/sign-in"
          [queryParams]="{ audience: 'operator' }"
          >Sign in</a
        >
      }
    }
  `,
})
export class ProtoAccountMenu {
  readonly placement = input<'down' | 'up'>('down');
  readonly compact = input(false);
  readonly showAdmin = input(true);
  /** G: only the account rows — Create a venue lives under the venue switcher. */
  readonly minimal = input(false);
  /** G: the porcelain / dark rows. */
  readonly themeSwitch = input(false);
  readonly signOut = output<void>();

  protected readonly operator = inject(OperatorAuth);
  protected readonly consoleTheme = inject(PrototypeConsoleTheme);
  protected readonly open = signal(false);
  protected readonly exactPath = EXACT_PATH;
  protected readonly avatar = AVATAR;
  protected readonly backdrop = BACKDROP;
  protected readonly popItem = POP_ITEM;
  protected readonly popBtn = POP_BTN;

  protected readonly chip = computed(() =>
    this.compact() ? `${CHIP_BTN} px-1.5` : `${CHIP_BTN} py-1 pr-2.5 pl-1.5`,
  );
  protected readonly pop = computed(() =>
    this.placement() === 'up'
      ? `bottom-[calc(100%+8px)] left-0 w-[248px] p-[7px] ${POP}`
      : `top-[calc(100%+8px)] right-0 w-[248px] p-[7px] ${POP}`,
  );
  protected readonly initial = computed(() => initialOf(this.operator.username()));
  protected readonly handle = computed(() => handleOf(this.operator.username()));

  protected close(): void {
    this.open.set(false);
  }
}

import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { ConsoleTheme, ConsoleThemeId } from '../core/console-theme';
import { OperatorAuth } from '../core/operator-auth';
import {
  AVATAR,
  CHIP,
  EXACT_PATH,
  POP_BACKDROP,
  POP_BUTTON,
  POP_ITEM,
  POP_SKIN,
  handleOf,
  initialOf,
} from '../shared/popover-skin';
import { TouchTarget } from '../shared/touch-target';

/**
 * The signed-in operator's account chip (the host gates on the session): a disclosure revealing
 * identity, Change password, console theme and Sign out — account actions only, never venue ones.
 * Sign-out is an output: each header runs its own teardown (parks focus, resets its stores).
 * Escape, the backdrop and a row return focus to the chip (WCAG 2.4.3); a navigation or an outside
 * click closes without moving it. Outside clicks need the document listener: the header's
 * `backdrop-filter` contains the `fixed` backdrop, so that backdrop covers only the header.
 */
@Component({
  selector: 'app-operator-account-chip',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: {
    class: 'relative flex items-center',
    '(document:keydown.escape)': 'dismiss()',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <button
      appTouchTarget
      #chip
      type="button"
      [class]="cls.chip"
      [attr.data-testid]="ids().account"
      [attr.aria-label]="'Account: ' + username()"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      <span [class]="cls.avatar + ' size-[30px] text-[13px]'" aria-hidden="true">{{
        initial()
      }}</span>
      <span class="max-w-[130px] truncate max-sm:hidden">{{ handle() }}</span>
      <span class="text-[9px] opacity-85" aria-hidden="true">&#9662;</span>
    </button>

    @if (open()) {
      <div
        [class]="cls.backdrop"
        [attr.data-testid]="ids().backdrop"
        (click)="dismiss()"
        aria-hidden="true"
      ></div>
      <div [class]="cls.pop" [attr.data-testid]="ids().menu">
        <div
          class="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2.5"
          [attr.data-testid]="ids().identity"
        >
          <span [class]="cls.avatar + ' size-9 text-[15px]'" aria-hidden="true">{{
            initial()
          }}</span>
          <span class="min-w-0 leading-tight">
            <span class="block truncate text-[14px] font-bold text-riv-pop-ink">{{
              handle()
            }}</span>
            <span class="block truncate text-[12px] text-riv-pop-ink-soft"
              >Signed in as {{ username() }}</span
            >
          </span>
        </div>
        <a
          appTouchTarget
          routerLink="/account/operator-password"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [routerLinkActiveOptions]="exactPath"
          [class]="cls.item"
          [attr.data-testid]="ids().changePassword"
          (click)="activate()"
          >Change password</a
        >
        <p [class]="cls.groupLabel" [attr.id]="ids().themeLabel">Console theme</p>
        <div role="group" [attr.aria-labelledby]="ids().themeLabel">
          @for (option of consoleTheme.options; track option.id) {
            <button
              appTouchTarget
              type="button"
              [class]="cls.button"
              [attr.aria-pressed]="option.id === consoleTheme.theme()"
              [attr.data-testid]="ids().theme + '-' + option.id"
              (click)="choose(option.id)"
            >
              <span class="flex items-center gap-2.5">
                <span
                  class="size-[18px] shrink-0 rounded-full ring-1 ring-riv-pop-divider"
                  [style.background]="option.swatch"
                  aria-hidden="true"
                ></span>
                <span class="flex-1">{{ option.name }}</span>
                @if (option.id === consoleTheme.theme()) {
                  <span class="text-[15px] font-bold text-riv-pop-accent" aria-hidden="true"
                    >&#10003;</span
                  >
                }
              </span>
            </button>
          }
        </div>
        <button
          appTouchTarget
          type="button"
          [class]="cls.button"
          [attr.data-testid]="ids().signout"
          (click)="activate(); signOut.emit()"
        >
          Sign out
        </button>
      </div>
    }
  `,
})
export class OperatorAccountChip {
  readonly testIdPrefix = input.required<string>();
  readonly signOut = output<void>();

  protected readonly operator = inject(OperatorAuth);
  /** The console's porcelain-or-dark choice the two rows switch; never the tourist theme. */
  protected readonly consoleTheme = inject(ConsoleTheme);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly chipButton = viewChild.required<ElementRef<HTMLButtonElement>>('chip');

  protected readonly open = signal(false);
  protected readonly exactPath = EXACT_PATH;
  protected readonly cls = {
    chip: `inline-flex touch-manipulation items-center gap-2 py-1 pr-3 pl-1.5 text-[13px] font-semibold text-riv-ink ${CHIP}`,
    avatar: `${AVATAR} ring-1 ring-riv-console-avatar-ring`,
    backdrop: POP_BACKDROP,
    pop: `absolute top-[calc(100%+10px)] right-0 w-[248px] p-[7px] ${POP_SKIN}`,
    item: POP_ITEM,
    button: POP_BUTTON,
    groupLabel:
      'mt-1 border-t border-riv-pop-divider px-2.5 pt-2.5 pb-1 text-[11px] font-bold tracking-[0.14em] text-riv-pop-ink-soft uppercase',
  } as const;

  protected readonly username = computed(() => this.operator.username() ?? '');
  protected readonly handle = computed(() => handleOf(this.username()));
  protected readonly initial = computed(() => initialOf(this.username()));

  /** Computed, not a method: these bind in a sticky header that re-runs change detection on
   *  every navigation, and a method would re-allocate all eight strings each pass. */
  protected readonly ids = computed(() => {
    const prefix = this.testIdPrefix();
    return {
      account: `${prefix}-account`,
      menu: `${prefix}-account-menu`,
      backdrop: `${prefix}-account-backdrop`,
      identity: `${prefix}-account-identity`,
      changePassword: `${prefix}-change-password`,
      themeLabel: `${prefix}-theme-label`,
      theme: `${prefix}-theme`,
      signout: `${prefix}-signout`,
    };
  });

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  /** A theme row: the choice, then the row's own close — the popover's rows all hand focus back. */
  protected choose(id: ConsoleThemeId): void {
    this.consoleTheme.select(id);
    this.activate();
  }

  /** A row was activated: close, and hand focus back to the chip the row's unmount would strand it from. */
  protected activate(): void {
    this.open.set(false);
    this.chipButton().nativeElement.focus();
  }

  /** Escape or the backdrop: the same close, a no-op while closed so it never steals focus. */
  protected dismiss(): void {
    if (this.open()) {
      this.activate();
    }
  }

  /** A click below the header: close, leaving focus on whatever was clicked. */
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}

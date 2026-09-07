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
 * The signed-in operator's account chip, for every operator header: an avatar + handle button that
 * discloses the identity block (`Signed in as <username>`), `Create a venue`, `Admin console`
 * (admins only), `Change password` and `Sign out`. The same disclosure pattern as the tourist
 * header's account menu — a button with `aria-expanded` revealing plain links, a backdrop, Escape
 * — on the `--riv-pop-*` tokens, so it is theme-agnostic. Rendered only while signed in: the host
 * gates on the session and keeps its own signed-out control.
 *
 * <p>Two things belong to the call site. The **test-id prefix** is an input, so each header keeps
 * its own ids. **Sign-out is an output, not a behavior**: a header must run its own teardown —
 * parking focus before the chip unmounts, and resetting any store that would otherwise outlive the
 * session — and this component must not choose one of those for it.
 *
 * <p>Focus is moved on every leg that unmounts the focused element (WCAG 2.4.3): Escape, the
 * backdrop and a row activation all return it to the chip. A navigation that ends while the
 * popover is open (focus tabbed out of it) closes the popover without touching focus.
 */
@Component({
  selector: 'app-operator-account-chip',
  imports: [RouterLink, RouterLinkActive, TouchTarget],
  host: { class: 'relative flex items-center', '(document:keydown.escape)': 'dismiss()' },
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
          routerLink="/operator"
          [queryParams]="{ create: '1' }"
          [class]="cls.item"
          [attr.data-testid]="ids().createVenue"
          (click)="activate()"
          >Create a venue</a
        >
        @if (operator.isAdmin()) {
          <a
            appTouchTarget
            routerLink="/admin"
            routerLinkActive
            ariaCurrentWhenActive="page"
            [class]="cls.item"
            [attr.data-testid]="ids().adminLink"
            (click)="activate()"
            >Admin console</a
          >
        }
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
  private readonly chipButton = viewChild.required<ElementRef<HTMLButtonElement>>('chip');

  protected readonly open = signal(false);
  protected readonly exactPath = EXACT_PATH;
  protected readonly cls = {
    chip: `inline-flex items-center gap-2 py-1 pr-3 pl-1.5 text-[13px] font-semibold text-riv-ink ${CHIP}`,
    avatar: AVATAR,
    backdrop: POP_BACKDROP,
    pop: `absolute top-[calc(100%+10px)] right-0 w-[248px] p-[7px] ${POP_SKIN}`,
    item: POP_ITEM,
    button: POP_BUTTON,
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
      createVenue: `${prefix}-create-venue`,
      adminLink: `${prefix}-admin-link`,
      changePassword: `${prefix}-change-password`,
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
}

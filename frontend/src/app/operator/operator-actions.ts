import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { TouchTarget } from '../shared/touch-target';

/**
 * The signed-in operator's navigation cluster — create a venue, Admin (admins only), change
 * password, who you are, sign out — for every operator header.
 *
 * <p>The host is `display: contents`, so each header's own flex container lays the items out and
 * keeps its own gap; mounting this component moves nothing on screen.
 *
 * <p>Two things belong to the call site. The **test-id prefix** is an input, so each header keeps
 * its own ids. **Sign-out is an output, not a behavior**: a header must run its own teardown —
 * parking focus before the button unmounts, and resetting any store that would otherwise outlive
 * the session — and this component must not choose one of those for it.
 */
@Component({
  selector: 'app-operator-actions',
  imports: [RouterLink, TouchTarget],
  host: { class: 'contents' },
  template: `
    <a
      appTouchTarget
      class="inline-flex items-center text-[13px] font-semibold text-riv-ink no-underline hover:underline"
      routerLink="/operator"
      [queryParams]="{ create: '1' }"
      [attr.data-testid]="ids().createVenue"
      >Create a venue</a
    >
    @if (operator.isAdmin()) {
      <a
        appTouchTarget
        class="inline-flex items-center text-[13px] font-semibold text-riv-ink no-underline hover:underline"
        routerLink="/admin"
        [attr.data-testid]="ids().adminLink"
        >Admin</a
      >
    }
    <a
      appTouchTarget
      class="inline-flex items-center text-[13px] font-semibold text-riv-ink no-underline hover:underline"
      routerLink="/account/operator-password"
      [attr.data-testid]="ids().changePassword"
      >Change password</a
    >
    <span class="text-[13px] text-riv-ink-soft" [attr.data-testid]="ids().signedInAs"
      >Signed in as <strong class="text-riv-ink">{{ operator.username() }}</strong></span
    >
    <button
      type="button"
      appTouchTarget
      class="cursor-pointer rounded-full border border-riv-console-btn-border bg-white px-3.75 py-1.75 font-sans text-[13px] font-semibold text-riv-ink shadow-[0_1px_2px_rgba(7,42,58,0.08)] transition-colors hover:bg-[#eef1f2] motion-reduce:transition-none"
      [attr.data-testid]="ids().signout"
      (click)="signOut.emit()"
    >
      Sign out
    </button>
  `,
})
export class OperatorActions {
  readonly testIdPrefix = input.required<string>();
  readonly signOut = output<void>();

  protected readonly operator = inject(OperatorAuth);

  /** Computed, not a method: these bind in a sticky header that re-runs change detection on
   *  every navigation, and a method would re-allocate all five strings each pass. */
  protected readonly ids = computed(() => {
    const prefix = this.testIdPrefix();
    return {
      createVenue: `${prefix}-create-venue`,
      adminLink: `${prefix}-admin-link`,
      changePassword: `${prefix}-change-password`,
      signedInAs: `${prefix}-signed-in-as`,
      signout: `${prefix}-signout`,
    };
  });
}

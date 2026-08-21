import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { TouchTarget } from '../shared/touch-target';

/**
 * The signed-in operator's navigation cluster — create a venue, Admin (admins only), change
 * password, who you are, sign out — stated once for both operator headers. The shell chrome and
 * the venue console each carried their own copy, identical down to the utility classes; the
 * chrome's own doc comment described itself as mirroring the console's links, and nothing kept
 * the two mirrors in step.
 *
 * <p>The host is `display: contents`, so each header's own flex container still lays out the
 * items directly and keeps its own gap — adopting this component moves nothing on screen.
 *
 * <p>Two things stay with the call site, because they genuinely differ. The **test-id prefix**
 * (`opc-` on the chrome, `oc-` on the console) is an input, so each header's specs keep asserting
 * their own ids. **Sign-out is an output, not a behavior**: the chrome parks focus on `<main>`
 * before the button unmounts and then leaves, while the console additionally resets the venue,
 * map and request stores so the next operator cannot inherit them.
 */
@Component({
  selector: 'app-operator-actions',
  imports: [RouterLink, TouchTarget],
  host: { class: 'contents' },
  template: `
    <a
      appTouchTarget
      class="inline-flex items-center text-[13px] font-semibold text-(--riv-ink) no-underline hover:underline"
      routerLink="/operator"
      [queryParams]="{ create: '1' }"
      [attr.data-testid]="testId('create-venue')"
      >Create a venue</a
    >
    @if (operator.isAdmin()) {
      <a
        appTouchTarget
        class="inline-flex items-center text-[13px] font-semibold text-(--riv-ink) no-underline hover:underline"
        routerLink="/admin"
        [attr.data-testid]="testId('admin-link')"
        >Admin</a
      >
    }
    <a
      appTouchTarget
      class="inline-flex items-center text-[13px] font-semibold text-(--riv-ink) no-underline hover:underline"
      routerLink="/account/operator-password"
      [attr.data-testid]="testId('change-password')"
      >Change password</a
    >
    <span class="text-[13px] text-(--riv-ink-soft)" [attr.data-testid]="testId('signed-in-as')"
      >Signed in as <strong class="text-(--riv-ink)">{{ operator.username() }}</strong></span
    >
    <button
      type="button"
      appTouchTarget
      class="cursor-pointer rounded-full border border-[rgba(12,42,51,0.14)] bg-white px-3.75 py-1.75 font-sans text-[13px] font-semibold text-(--riv-ink) shadow-[0_1px_2px_rgba(7,42,58,0.08)] transition-colors hover:bg-[#eef1f2] motion-reduce:transition-none"
      [attr.data-testid]="testId('signout')"
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

  protected testId(suffix: string): string {
    return `${this.testIdPrefix()}-${suffix}`;
  }
}

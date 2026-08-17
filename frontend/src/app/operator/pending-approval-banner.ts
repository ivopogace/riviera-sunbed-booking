import { Component, inject } from '@angular/core';

import { OperatorAuth } from '../core/operator-auth';

/**
 * The pending-approval notice for a signed-in PENDING operator: the whole console
 * works, but its venues stay hidden from tourists until a platform admin approves the account —
 * without this line the operator has no explanation for a venue that takes no bookings. Renders
 * nothing for an approved operator, so hosts (operator home, the console shell) include it
 * unconditionally. A polite `role="status"` region: state, not an interruption.
 */
@Component({
  selector: 'app-pending-approval-banner',
  template: `
    @if (operator.pendingApproval()) {
      <div
        role="status"
        data-testid="pending-approval-banner"
        class="mb-4 flex items-start gap-3 rounded-[16px] border border-[rgba(240,170,46,0.55)] bg-[rgba(240,170,46,0.14)] px-4 py-3"
      >
        <span aria-hidden="true" class="text-[18px] leading-[1.4]">⏳</span>
        <p class="m-0 text-[13.5px] leading-[1.5] text-(--riv-card-ink)">
          <strong class="font-semibold">Your account is awaiting approval.</strong>
          You can set everything up now — your venues stay hidden from tourists until a platform
          admin approves your account.
        </p>
      </div>
    }
  `,
})
export class PendingApprovalBanner {
  protected readonly operator = inject(OperatorAuth);
}

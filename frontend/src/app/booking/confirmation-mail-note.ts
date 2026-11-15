import { Component, input } from '@angular/core';

import type { ConfirmationMail } from './booking.model';
import { WithheldEmailNotice } from './withheld-email-notice';

/**
 * What a confirmed booking's screen says about the confirmation mail, by the backend's disclosure:
 * "we've also emailed it" and the withheld notice only for the address's verified owner, a neutral
 * keep-your-code line for everyone else, which never claims a mail went out (#1748). One component,
 * so the three copies can't drift between `booking-confirmation` and `booking-pay`.
 */
@Component({
  selector: 'app-confirmation-mail-note',
  imports: [WithheldEmailNotice],
  template: `
    @switch (mail()) {
      @case ('WITHHELD') {
        <app-withheld-email-notice />
      }
      @case ('EMAILED') {
        <p class="mt-2 text-[12px] leading-[1.4] text-riv-card-ink-soft" data-testid="email-sent">
          <ng-container i18n>We’ve also emailed it to you.</ng-container>
        </p>
      }
      @default {
        <p
          class="mt-2 text-[12px] leading-[1.4] text-riv-card-ink-soft"
          data-testid="email-pending"
        >
          <ng-container i18n
            >We’re emailing it to you. Keep this code in case it doesn’t arrive.</ng-container
          >
        </p>
      }
    }
  `,
})
export class ConfirmationMailNote {
  readonly mail = input.required<ConfirmationMail>();
}

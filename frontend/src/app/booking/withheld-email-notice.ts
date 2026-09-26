import { Component } from '@angular/core';

/**
 * The "we couldn't email you — save your code" notice, shared by `booking-confirmation` and
 * `booking-pay`'s done panel: one component, so the copy can't drift into one surface promising a
 * mail that was never sent. The fill is a solid composite, not a translucent tint, so the contrast
 * spec and Sonar (`css:S7924`) compute the real ratio. No live region: it enters the DOM with its
 * container and a region announces only later mutations; `booking-pay` folds it into its own.
 */
@Component({
  selector: 'app-withheld-email-notice',
  template: `
    <p
      class="mt-[10px] rounded-[12px] bg-riv-warn-fill px-[12px] py-[10px] text-left text-[12px] leading-[1.45] text-riv-warn-ink"
      data-testid="email-withheld"
    >
      <strong class="font-bold">We couldn’t email you.</strong> We weren’t able to send a
      confirmation to that address, so this code is your only record — save it or take a screenshot
      before you leave this page.
    </p>
  `,
})
export class WithheldEmailNotice {}

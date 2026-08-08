import { Component } from '@angular/core';

/**
 * The "we couldn't email you — save your code" notice, shared by the two post-payment
 * surfaces (`booking-confirmation` and `booking-pay`'s done panel).
 *
 * <p>One component rather than the same markup in both: the copy is the product decision here, and
 * two copies drift — an edit to one surface would leave the other quietly promising a mail that was
 * never sent, with both duplicated tests staying green.
 *
 * <p>Colocated in `booking/`, not promoted to `shared/`: both consumers are in this one feature, and
 * the content is booking-domain product copy rather than a reusable primitive like `money.ts` —
 * `riviera-frontend`'s promotion trigger is *two features* needing the same thing.
 *
 * <p>Styled in Tailwind (the go-forward) even though both consumers are still SCSS-styled: it is a
 * new file, not an island inside a grandfathered stylesheet. The fill is a **solid** composite of the
 * design's amber tint rather than a translucent one — the same trick `.done-badge.warn` and
 * `.failure-icon` use — so both the contrast spec and SonarCloud's static analysis (`css:S7924`)
 * compute the real ratio (5.5:1) instead of a surface-dependent guess.
 *
 * <p>Deliberately no live region: on both surfaces this enters the DOM together with its container,
 * and a live region only announces content that mutates once it is already there. `booking-pay`
 * folds the fact into the page's one persistent live region instead.
 */
@Component({
  selector: 'app-withheld-email-notice',
  template: `
    <p
      class="mt-[10px] rounded-[12px] bg-[#fcf0d9] px-[12px] py-[10px] text-left text-[12px] leading-[1.45] text-[#8a5410]"
      data-testid="email-withheld"
    >
      <strong class="font-bold">We couldn’t email you.</strong> We weren’t able to send a
      confirmation to that address, so this code is your only record — save it or take a screenshot
      before you leave this page.
    </p>
  `,
})
export class WithheldEmailNotice {}

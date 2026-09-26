import { Component, computed, input } from '@angular/core';

import { MOBILE_ITEM, POP_ITEM } from './popover-skin';
import { TouchTarget } from './touch-target';

/** Which menu the rows are wearing: the phone sheet's rows, or the desktop popover's. */
export type LegalMenuVariant = 'sheet' | 'popover';

const SKINS: Record<LegalMenuVariant, string> = {
  sheet: MOBILE_ITEM,
  popover: POP_ITEM,
};

/**
 * Privacy and Terms as menu rows, for tourist routes like Discover whose edge-to-edge map withholds
 * the footer; every route keeps one of the two (`app.ts`'s `TouristRouteData`), and the sheet and
 * popovers must stay above every Discover layer. They open a new tab, never route (on `booking/pay`
 * routing unmounts the Payment Element), so they neither close their menu nor take
 * `routerLinkActive`. Call sites put them last in an `mt-1` group: `toggleMenu` focuses the first
 * row, and a hairline would owe a measured ratio (`docs/design/non-text-contrast.md` rule 2a).
 */
@Component({
  selector: 'app-legal-menu-rows',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `<a
      appTouchTarget
      [class]="skin()"
      href="/legal/privacy"
      target="_blank"
      rel="noopener"
      data-testid="legal-privacy-row"
      >Privacy policy</a
    >
    <a
      appTouchTarget
      [class]="skin()"
      href="/legal/terms"
      target="_blank"
      rel="noopener"
      data-testid="legal-terms-row"
      >Terms of service</a
    >`,
})
export class LegalMenuRows {
  readonly variant = input.required<LegalMenuVariant>();

  protected readonly skin = computed(() => SKINS[this.variant()]);
}

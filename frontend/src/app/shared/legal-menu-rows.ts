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
 * Privacy and Terms as menu rows, for the chrome that is present on every tourist route. Discover's
 * riviera map paints to every edge and the route withholds the shared footer, so nothing in that
 * document's flow is reachable — a control there is reported visible, enabled and stable while
 * every click on it times out. The menu is the one surface above the page: the sheet is `z-40` and
 * the header's popovers sit inside its `z-20` stacking context, over page layers that top out at
 * `z-[11]`.
 *
 * <p>New tab rather than routing, as `legal-footer.ts` and `booking/legal-consent.ts`: the desktop
 * popover renders on `booking/pay`, where routing away would unmount a mounted Payment Element.
 * The rows deliberately do NOT close their menu — the other rows close because a same-URL
 * activation emits `NavigationSkipped`, but a `target="_blank"` link never navigates the opener,
 * so there is no focus to move and the menu is where the guest left it on return.
 *
 * <p>Rows rather than `legal-footer.ts`'s sentence: a menu has room for the names the routes
 * carry, its copyright notice is footer furniture, and a `block` row carries the 44 px floor where
 * the footer's inline links needed the WCAG 2.5.5 exemption.
 *
 * <p>Each call site puts the rows last, under a `mt-1` group: `toggleMenu` hard-codes the first row
 * it focuses on open, so the destinations keep the head of the list. The group is separated by space
 * and not a hairline because `--riv-pop-border` carries no measured ratio, and a separator would owe
 * one under `docs/design/non-text-contrast.md` rule 2a.
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

import { Directive } from '@angular/core';

/**
 * Tailwind twins of the retired `shared/_glass.scss` `failure-*` mixins — the load-failure panel
 * shared by Discover and the beach map. Four co-located directives, one per element of the panel;
 * import the whole set via `FAILURE_DIRECTIVES`. The literal marker classes (`failure`,
 * `failure-icon`, `failure-title`, `failure-text`) are RETAINED as inert test hooks. Self-contained:
 * inlines the card-glass recipe plus its own surface extras, so a consumer applies one attribute.
 */
@Directive({
  selector: '[appFailurePanel]',
  host: {
    class:
      'failure bg-(--riv-card-glass) border border-(--riv-card-border) text-(--riv-card-ink) mt-7 px-[26px] py-[52px] text-center backdrop-blur-[24px] backdrop-saturate-[1.7] rounded-[26px] shadow-[0_12px_40px_rgba(7,42,58,0.24),inset_0_1px_0_rgba(255,255,255,0.8)]',
  },
})
export class FailurePanel {}

// Decorative danger badge (aria-hidden; the heading carries the meaning). Solid light-peach fill
// so #a3372a clears contrast unambiguously (css:S7924).
@Directive({
  selector: '[appFailureIcon]',
  host: {
    class:
      'failure-icon flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-full bg-[#f7e8e4] border border-[#eecdc4] text-[#a3372a] text-[26px]',
  },
})
export class FailureIcon {}

@Directive({
  selector: '[appFailureTitle]',
  host: {
    class: 'failure-title m-0 mb-[7px] font-bold text-[21px] tracking-[-0.01em] text-(--riv-card-ink)',
  },
})
export class FailureTitle {}

@Directive({
  selector: '[appFailureText]',
  host: {
    class: 'failure-text mx-auto mb-5 max-w-[380px] text-[14.5px] leading-normal text-(--riv-card-ink-soft)',
  },
})
export class FailureText {}

/** The four failure-panel directives, for a component's `imports`. */
export const FAILURE_DIRECTIVES = [FailurePanel, FailureIcon, FailureTitle, FailureText] as const;

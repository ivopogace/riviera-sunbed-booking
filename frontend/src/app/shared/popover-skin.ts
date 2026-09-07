import { IsActiveMatchOptions } from '@angular/router';

/**
 * The header disclosure recipes the tourist shell (`app.ts`), the operator account chip
 * (`operator/operator-account-chip.ts`) and the venue switcher (`operator/operator-venue-switch.ts`)
 * paint from one place, so the popovers cannot drift (`riviera-tailwind`, no visual drift). Class
 * strings, not a directive: each consumer composes them with its own position and width, the `cls`
 * idiom.
 */

/** The near-opaque popover surface (account menu, theme picker, the phone sheet) — themed via the
 *  `--riv-pop-*` family: light in porcelain/riviera, slate in the dark theme. Position-free: the
 *  account and theme popovers are `absolute` under their trigger, the venue switcher's `fixed`
 *  under the console shell's header row, the sheet `fixed` above the tab bar. */
export const POP_SKIN =
  'z-40 animate-[riv-pop_0.2s_ease] rounded-[18px] border border-riv-pop-border bg-riv-pop-surface text-riv-pop-ink shadow-riv-pop backdrop-blur-[28px] backdrop-saturate-[1.8] motion-reduce:animate-none';

/** The click-catching veil under an open header popover. */
export const POP_BACKDROP = 'fixed inset-0 z-30 bg-[rgba(6,30,40,0.2)]';

/** The current page's row takes the hover fill plus the popover accent ink, on the desktop popover
 *  and the sheet alike: it has to read on touch, where `hover:` never fires (Tailwind v4 compiles
 *  it under `@media (hover: hover)`). */
export const CURRENT_POP_ROW =
  'aria-[current=page]:bg-riv-pop-hover aria-[current=page]:text-riv-pop-accent';

/** A popover row: a link, or with {@link POP_BUTTON} a button. `block`, so `appTouchTarget`'s
 *  floor is live on an `<a>`. */
export const POP_ITEM = `block w-full rounded-xl px-2.5 py-[9px] text-[14px] font-semibold text-riv-pop-ink [transition:background_0.12s_ease] hover:bg-riv-pop-hover ${CURRENT_POP_ROW}`;

export const POP_BUTTON = `${POP_ITEM} cursor-pointer text-left`;

/** The chip glass the desktop menu button and the account chips share, inner highlight included. */
export const CHIP =
  'cursor-pointer rounded-full border border-riv-chip-border bg-riv-chip-bg shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-[10px] [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none';

/** The avatar disc — the solid-fill family, not the CTA gradient: nothing in a header may outweigh
 *  the page's primary button. Sized by the call site. */
export const AVATAR =
  'inline-flex shrink-0 items-center justify-center rounded-full bg-riv-solid-fill-brand font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]';

/** `routerLinkActive` matching for a header's plain-path links: the path alone, so Beaches (`/`)
 *  does not stay lit on every page and a `returnUrl` does not unlight the account page. */
export const EXACT_PATH: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

/** The part of the principal name before the `@`: the chip's visible label. */
export function handleOf(name: string): string {
  return name.split('@')[0];
}

/** The avatar's initial. */
export function initialOf(name: string): string {
  return name.charAt(0).toUpperCase();
}

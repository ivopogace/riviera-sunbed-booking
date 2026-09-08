import { IsActiveMatchOptions } from '@angular/router';

/**
 * The header disclosure recipes the tourist shell (`app.ts`), the operator account chip
 * (`operator/operator-account-chip.ts`), the venue switcher (`operator/operator-venue-switch.ts`),
 * the console shell's More sheet (`console-shell.ts`) and the ⌘K palette (`console-palette.ts`)
 * paint from one place, so the popovers cannot drift (`riviera-tailwind`, no visual drift). Class strings, not a directive: each consumer
 * composes them with its own position and width, the `cls` idiom.
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

/** The project ring on a popover or sheet row that is an `<a>`: `tailwind.css`'s `@layer base`
 *  rule paints `button:focus-visible` only, so a link row showed the user-agent ring beside a
 *  button row's 3px ink ring on the same surface. The values are the baseline's own — a
 *  button wearing the same skin repeats its ring, it does not change it (`riviera-tailwind` rule 6). */
export const POP_ROW_RING =
  'focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink';

/** A popover row: a link, or with {@link POP_BUTTON} a button. `block`, so `appTouchTarget`'s
 *  floor is live on an `<a>`. */
export const POP_ITEM = `block w-full rounded-xl px-2.5 py-[9px] text-[14px] font-semibold text-riv-pop-ink [transition:background_0.12s_ease] hover:bg-riv-pop-hover ${CURRENT_POP_ROW} ${POP_ROW_RING}`;

export const POP_BUTTON = `${POP_ITEM} cursor-pointer text-left`;

/** A navigation row with a glyph, a label and a hint line — the More sheet's and the palette's:
 *  `flex`, so the 44px floor is live on the `<a>`; the current row is the popover's own recipe. */
export const POP_NAV_ROW = `flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3.5 py-[11px] text-left text-[15px] font-semibold text-riv-pop-ink no-underline [transition:background_0.12s_ease] hover:bg-riv-pop-hover [&_svg]:size-[18px] [&_svg]:shrink-0 ${CURRENT_POP_ROW} ${POP_ROW_RING}`;

/** The one-line hint under a {@link POP_NAV_ROW}'s label. */
export const POP_NAV_HINT = 'text-[12px] font-medium text-riv-pop-ink-soft';

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

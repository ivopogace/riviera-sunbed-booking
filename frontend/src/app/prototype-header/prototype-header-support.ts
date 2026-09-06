import { IsActiveMatchOptions } from '@angular/router';

/** PROTOTYPE — the bits every header variant shares; the variants stay free to differ in layout. */
export type OpenSurface = 'none' | 'menu' | 'theme' | 'account';

export const EXACT_PATH: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

export const GLASS_HEADER =
  "riv-header sticky top-0 z-20 border-b border-riv-header-border shadow-[0_8px_30px_rgba(6,38,52,0.14)] before:absolute before:inset-0 before:z-[-1] before:bg-riv-header-glass before:backdrop-blur-[22px] before:backdrop-saturate-[1.7] before:content-['']";

export const BACKDROP = 'fixed inset-0 z-30 bg-[rgba(6,30,40,0.2)]';

export const POP =
  'absolute z-40 animate-[riv-pop_0.2s_ease] rounded-[18px] border border-riv-pop-border bg-riv-pop-surface text-riv-pop-ink shadow-riv-pop backdrop-blur-[28px] backdrop-saturate-[1.8] motion-reduce:animate-none';

const CURRENT_POP_ROW =
  'aria-[current=page]:bg-riv-pop-hover aria-[current=page]:text-riv-pop-accent';

export const POP_ITEM = `flex w-full min-h-11 items-center rounded-xl px-2.5 py-[9px] text-left text-[14px] font-semibold text-riv-pop-ink [transition:background_0.12s_ease] hover:bg-riv-pop-hover ${CURRENT_POP_ROW}`;

export const POP_BTN = `${POP_ITEM} cursor-pointer`;

export const SHEET_ITEM = `flex w-full min-h-11 items-center rounded-[14px] px-3.5 py-[13px] text-left text-[15.5px] font-semibold text-riv-pop-ink hover:bg-riv-pop-hover ${CURRENT_POP_ROW}`;

export const AVATAR =
  'inline-flex shrink-0 items-center justify-center rounded-full bg-(image:--riv-cta-grad) text-white font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]';

export const CTA =
  'inline-flex min-h-11 cursor-pointer items-center rounded-full border border-riv-cta-border bg-(image:--riv-cta-grad) px-[17px] text-[13.5px] font-bold text-white shadow-[0_8px_20px_rgba(11,120,150,0.4),inset_0_1px_0_rgba(255,255,255,0.5)] [transition:filter_0.15s_ease] hover:brightness-[1.06] focus-visible:outline-white motion-reduce:transition-none';

export const THEME_OPTION =
  'flex w-full min-h-11 cursor-pointer items-center gap-[11px] rounded-xl bg-transparent px-2.5 py-[9px] text-left [transition:background_0.12s_ease] hover:bg-riv-pop-hover';

export function initialOf(email: string | undefined): string {
  const first = email?.trim().charAt(0) ?? '';
  return (first === '' ? '?' : first).toUpperCase();
}

export function handleOf(email: string | undefined): string {
  return email?.split('@')[0] ?? '';
}

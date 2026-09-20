/**
 * PROTOTYPE — throwaway. Round 10's open critique of the desktop, taken to code: the shipped
 * header is shared chrome, so this is a PAGE-SCOPED treatment of the rendered header rather than
 * an edit to `app.html` — the same idiom the pin layer's dusk and merge states use (Tailwind
 * utilities toggled on shipped DOM). Shipped, it is a `data.wide` route flag plus
 * `data-wide:max-w-none` on the header's inner wrapper — Tailwind v4's bare boolean data variant.
 *
 * <p>Three things, each a token in `?hdr=` (`shell` = the shipped header, untouched):
 *
 * <ul>
 *   <li><b>wide</b> — the inner wrapper's `max-w-[1080px]` becomes `max-w-none`, so at 1440 the
 *       brand sits over the panel's edge instead of 190 px inside it and the nav ends over the map
 *       instead of 200 px short of it.
 *   <li><b>lower</b> / <b>noeyebrow</b> — the `ALBANIAN COAST` eyebrow (10 px at 0.24em, 2.4×
 *       Tailwind's `tracking-widest`) as 12.5 px `tracking-wide` in its own case, or gone.
 *   <li><b>menu</b> — the unlabelled theme swatch leaves the header for a labelled row in the
 *       menu the hamburger opens. The row is a demonstration: it names the control and the active
 *       theme, and the shipped popover stays the thing that changes it.
 * </ul>
 */
import { POP_ITEM } from '../../shared/popover-skin';

const WRAPPER = 'header.riv-header > div';
const BRAND = '[data-testid="brand-home"]';
const SWATCH = '[data-testid="theme-toggle"]';
const MENU = '[data-testid="nav-account-menu"]';

/** The eyebrow as the shipped header sets it, and as round 11 offers it. */
const EYEBROW_SHIPPED = ['text-[10px]', 'tracking-[0.24em]', 'uppercase'];
const EYEBROW_LOWER = ['text-[12.5px]', 'tracking-wide'];

/** The popover's own row skin; the flex line is an inner span, since POP_ITEM is a `block`. */
const THEME_ROW = POP_ITEM;

export interface HeaderTreatment {
  readonly wide: boolean;
  readonly eyebrow: 'shipped' | 'lower' | 'off';
  readonly swatch: 'header' | 'menu';
}

/** `?hdr=` as tokens; `shell` is the shipped header and the rest compose. */
export function headerTreatment(flag: string | null): HeaderTreatment {
  const tokens = new Set((flag ?? 'wide,lower,menu').split(','));
  if (tokens.has('shell')) return { wide: false, eyebrow: 'shipped', swatch: 'header' };
  return {
    wide: tokens.has('wide'),
    eyebrow: tokens.has('noeyebrow') ? 'off' : tokens.has('lower') ? 'lower' : 'shipped',
    swatch: tokens.has('menu') ? 'menu' : 'header',
  };
}

/** Apply the treatment to the rendered shell header; idempotent, so an effect may re-run it. */
export function applyHeaderTreatment(document: Document, t: HeaderTreatment): void {
  const wrapper = document.querySelector<HTMLElement>(WRAPPER);
  wrapper?.classList.toggle('max-w-[1080px]', !t.wide);
  wrapper?.classList.toggle('max-w-none', t.wide);

  const eyebrow = document.querySelector<HTMLElement>(
    `${BRAND} > span:last-child > span:last-child`,
  );
  if (eyebrow !== null) {
    eyebrow.classList.toggle('hidden', t.eyebrow === 'off');
    for (const cls of EYEBROW_SHIPPED) eyebrow.classList.toggle(cls, t.eyebrow !== 'lower');
    for (const cls of EYEBROW_LOWER) eyebrow.classList.toggle(cls, t.eyebrow === 'lower');
  }

  const swatch = document.querySelector<HTMLElement>(SWATCH);
  swatch?.parentElement?.classList.toggle('hidden', t.swatch === 'menu');
  if (t.swatch === 'menu') fillMenu(document, swatch);
}

/** The swatch's replacement: a named row at the top of the menu, with the active theme beside it. */
function fillMenu(document: Document, swatch: HTMLElement | null): void {
  const menu = document.querySelector<HTMLElement>(MENU);
  if (menu?.querySelector('[data-theme-row]') !== null) return;
  const name = (swatch?.getAttribute('aria-label') ?? 'Color theme: Porcelain').split(': ')[1];
  const row = document.createElement('span');
  row.dataset['themeRow'] = '';
  row.className = THEME_ROW;
  row.innerHTML =
    `<span class="flex items-center gap-[9px]">` +
    `<span class="h-[22px] w-[22px] shrink-0 rounded-full bg-(image:--riv-swatch) shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55)]"></span>` +
    `<span class="flex-1 text-left whitespace-nowrap">Colour theme</span>` +
    `<span class="shrink-0 text-[13px] font-normal text-riv-pop-ink-soft">${name}</span>` +
    `</span>`;
  row.style.setProperty('--riv-swatch', swatch?.style.getPropertyValue('--riv-swatch') ?? '');
  menu.prepend(row);
}

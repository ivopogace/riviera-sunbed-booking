import { AA_NORMAL, contrastRatio } from '../../../testing/contrast';

/**
 * WCAG-AA contrast guard for the venue-discovery design tokens (issue #61; gate from #38).
 * axe-core's `color-contrast` rule can't run under jsdom, so the colour pairs the page actually
 * uses are verified here by relative-luminance maths instead.
 *
 * This table mirrors every <em>text-bearing</em> `color` / `background` declaration in `home.scss`.
 * When a token changes there, update it here too — a colour edit must re-pass AA. Page-level text
 * sits on the app shell's slate-50 (#f8fafc); card/filter text sits on the white surfaces declared
 * in the scss. All pairs are normal-size text, so AA_NORMAL (4.5:1) applies throughout.
 *
 * Deliberately excluded: the decorative `.card-meta .star` (★) and `.card-meta .dot` (·) glyphs.
 * Both are `aria-hidden` and purely incidental — the numeric rating and the literal "·" carry no
 * information the surrounding text doesn't — so WCAG 1.4.3's incidental-text exception applies and
 * they are not held to AA (matching the venue-map contrast spec's treatment of the same glyphs).
 */
interface TokenPair {
  readonly fg: string;
  readonly bg: string;
  readonly usage: string;
}

const SLATE_50 = '#f8fafc'; // app shell <main> background (Tailwind bg-slate-50)
const WHITE = '#ffffff';

const TOKEN_PAIRS: readonly TokenPair[] = [
  { fg: '#22302f', bg: SLATE_50, usage: '.page-title on the app background' },
  { fg: '#54514b', bg: SLATE_50, usage: '.page-intro / .results / .state (muted) on the app background' },
  { fg: '#0e7a89', bg: SLATE_50, usage: '.results strong (teal count) on the app background' },
  { fg: '#22302f', bg: WHITE, usage: '.field-label / .card-name / .card-meta .rating on white' },
  { fg: '#54514b', bg: WHITE, usage: '.card-location / .card-meta / .price / .availability on white' },
  { fg: '#0e7a89', bg: WHITE, usage: '.price strong / .availability strong (teal) on white' },
  { fg: '#0c6675', bg: '#e6f4f3', usage: '.mode-pill text on its pill background' },
];

describe('Home (discovery) design-token contrast (WCAG AA)', () => {
  it.each(TOKEN_PAIRS)('$usage meets AA ($fg on $bg)', ({ fg, bg }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

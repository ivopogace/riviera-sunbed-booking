import { AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * WCAG-AA contrast guard for the beach-map design tokens (issue #38, AC-4). axe-core's
 * `color-contrast` rule cannot run under jsdom, so the colour pairs the map actually uses
 * are verified here by relative-luminance maths instead.
 *
 * This table MIRRORS the `color` / `background` declarations in `venue-map.scss`. When a
 * token changes there, update it here too — that is the point: a colour edit must re-pass
 * AA. Every state-bearing pair (available / premium / taken tiles) is included, plus the
 * map text and banners. All are normal-size text (the largest, `.availability strong` at
 * 1.2rem bold, still clears the stricter 4.5 threshold), so AA_NORMAL applies throughout.
 */
interface TokenPair {
  readonly fg: string;
  readonly bg: string;
  readonly usage: string;
}

const TOKEN_PAIRS: readonly TokenPair[] = [
  { fg: '#22302f', bg: '#ffffff', usage: ':host body text / .meta .rating' },
  { fg: '#54514b', bg: '#ffffff', usage: '.location / .meta / .legend / .state (muted)' },
  { fg: '#0c6675', bg: '#e6f4f3', usage: '.mode-pill text on pill background' },
  { fg: '#0e7a89', bg: '#ffffff', usage: '.availability strong (teal count)' },
  { fg: '#0f7d8c', bg: '#ffffff', usage: '.set-tile available text on white' },
  { fg: '#875911', bg: '#fbf1d9', usage: '.set-tile.premium text on cream' },
  { fg: '#696459', bg: '#ece8e0', usage: '.set-tile.taken text on taken background' },
  { fg: '#ffffff', bg: '#0e7a89', usage: '.sea-banner white text on lightest teal stop' },
  { fg: '#6f5f2c', bg: '#f6ecd6', usage: '.row-head / .row-price on lightest map stop' },
  { fg: '#6f5f2c', bg: '#efe0c2', usage: '.promenade on darkest map stop' },
];

describe('VenueMap design-token contrast (WCAG AA)', () => {
  it.each(TOKEN_PAIRS)('$usage meets AA ($fg on $bg)', ({ fg, bg }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

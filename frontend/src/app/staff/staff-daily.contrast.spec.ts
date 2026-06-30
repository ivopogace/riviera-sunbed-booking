import { AA_NORMAL, contrastRatio } from '../../testing/contrast';

/**
 * WCAG-AA contrast guard for the U8 staff daily-view design tokens. axe-core's `color-contrast`
 * rule cannot run under jsdom, so the colour pairs the view actually uses are verified here by
 * relative-luminance maths instead.
 *
 * This table MIRRORS the `color` / `background` declarations in `staff-daily.scss`. When a token
 * changes there, update it here too — a colour edit must re-pass AA. Every state-bearing tile pair
 * (free / premium / walk-in-marked / booked-online) is included, plus the chrome text and banners.
 * All are normal-size text, so AA_NORMAL (4.5) applies throughout.
 */
interface TokenPair {
  readonly fg: string;
  readonly bg: string;
  readonly usage: string;
}

const TOKEN_PAIRS: readonly TokenPair[] = [
  { fg: '#22302f', bg: '#ffffff', usage: 'body text / title / table cells / code' },
  { fg: '#54514b', bg: '#ffffff', usage: 'location / hint / legend / empty / table th / state' },
  { fg: '#0e7a89', bg: '#ffffff', usage: '.availability strong (teal count)' },
  { fg: '#875911', bg: '#ffffff', usage: '.notice (warm amber on white)' },
  { fg: '#0c6675', bg: '#ffffff', usage: '.link (sign out)' },
  { fg: '#ffffff', bg: '#0e7a89', usage: '.primary button + sea-banner lightest teal stop' },
  { fg: '#0f7d8c', bg: '#ffffff', usage: '.set-tile free text on white' },
  { fg: '#875911', bg: '#fbf1d9', usage: '.set-tile.premium text on cream' },
  { fg: '#14622f', bg: '#e7f5ec', usage: '.set-tile.marked text on light green' },
  { fg: '#696459', bg: '#ece8e0', usage: '.set-tile.online text on muted background' },
  { fg: '#6f5f2c', bg: '#f6ecd6', usage: '.row-head / .promenade on lightest map stop' },
  { fg: '#6f5f2c', bg: '#efe0c2', usage: '.promenade on darkest map stop' },
];

describe('StaffDaily design-token contrast (WCAG AA)', () => {
  it.each(TOKEN_PAIRS)('$usage meets AA ($fg on $bg)', ({ fg, bg }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

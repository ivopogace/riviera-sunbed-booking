/**
 * WCAG 2.1 colour-contrast maths (issue #38, AC-4). Pure functions so contrast can be
 * verified deterministically in a unit test, without a browser — axe-core's
 * `color-contrast` rule cannot run under jsdom (it needs real rendering/layout).
 *
 * Ratios follow WCAG relative-luminance (sRGB). AA thresholds:
 *  - normal text: 4.5:1
 *  - large text (>= 18.66px bold, or >= 24px regular): 3:1
 */

/** WCAG AA contrast ratio for normal-size text. */
export const AA_NORMAL = 4.5;
/** WCAG AA contrast ratio for large text (>= 18.66px bold or >= 24px regular). */
export const AA_LARGE = 3;

function channelLuminance(srgb8: number): number {
  const c = srgb8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a `#rrggbb` colour, per WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    throw new Error(`Expected a #rrggbb colour, got "${hex}"`);
  }
  const n = Number.parseInt(match[1], 16);
  const r = channelLuminance((n >> 16) & 0xff);
  const g = channelLuminance((n >> 8) & 0xff);
  const b = channelLuminance(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio (1–21) between two `#rrggbb` colours, order-independent. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

import { AA_LARGE, composite, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  CARD_INK,
  MODE_CHIP_GLASS,
  PHOTO_CHROME,
  PHOTO_CHROME_EDGE_ALPHA,
  WHITE,
  WORST_PHOTOS,
} from '../../testing/glass-tokens';

/**
 * WCAG 1.4.11 (non-text contrast) guard for the shared slideshow's chrome — the dot rail and the
 * prev/next step chips (issue #704).
 *
 * These are the only overlays in the app whose backdrop is **entirely outside our control**: an
 * uploaded photo can be any colour, so — following the convention #142 set for the Discover
 * location overlay — every pair below is proven over {@link WORST_PHOTOS}: both stops of the
 * placeholder gradient plus pure white and pure black.
 *
 * Why the chrome carries its own backing rather than borrowing the band's `--riv-photo-scrim`:
 * the dots and the chips paint ABOVE that scrim (the dots take `z-[1]`, the buttons `z-10`), and
 * the component is consumed by two hosts whose scrim geometry differs. A backing that is not the
 * component's own is a backing a third consumer can forget.
 *
 * Deliberately NOT asserted: the delta between the active and the inactive dot. 1.4.11 asks that
 * each indicator be discernible from its adjacent colour — which is what the two dot cases below
 * prove — not that two states of a decorative indicator differ by a fixed ratio. The dot strip is
 * inside the `aria-hidden` imagery layer; the step buttons carry the accessible names.
 */

/** The inactive dot's white alpha (`photo-slideshow.ts`); the active dot is opaque white. */
const INACTIVE_DOT_ALPHA = 0.65;

/** The step chip's glyph ink — `--riv-accent-ink`, on the white chip glass. */
const CHIP_GLYPH = '#085a6e';

describe('Photo-slideshow chrome contrast over any photo (WCAG 1.4.11, issue #704)', () => {
  it.each([
    { state: 'active', alpha: 1 },
    { state: 'inactive', alpha: INACTIVE_DOT_ALPHA },
  ])('the $state dot reads at 3:1 on its rail over any photo', ({ alpha }) => {
    for (const photo of WORST_PHOTOS) {
      const rail = composite(PHOTO_CHROME.color, PHOTO_CHROME.alpha, photo);
      const dot = composite(WHITE, alpha, rail);
      expect(
        contrastRatio(rgbToHex(dot), rgbToHex(rail)),
        `over photo ${rgbToHex(photo)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it("the step chip's edge marks the control boundary at 3:1 over any photo", () => {
    // The retired `--riv-card-border` could not: over a pure-white photo the chip glass composites to white and a white border vanishes into it.
    for (const photo of WORST_PHOTOS) {
      const chip = composite(MODE_CHIP_GLASS.color, MODE_CHIP_GLASS.alpha, photo);
      const edge = composite(CARD_INK, PHOTO_CHROME_EDGE_ALPHA, chip);
      expect(
        contrastRatio(rgbToHex(edge), rgbToHex(chip)),
        `over photo ${rgbToHex(photo)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the step chip glyph reads at 3:1 on the chip glass over any photo', () => {
    // Already true before #704 (the 0.85 glass floors the chip at rgb(217) even over black), pinned so a glass retune cannot quietly take it away.
    for (const photo of WORST_PHOTOS) {
      const chip = composite(MODE_CHIP_GLASS.color, MODE_CHIP_GLASS.alpha, photo);
      expect(
        contrastRatio(CHIP_GLYPH, rgbToHex(chip)),
        `over photo ${rgbToHex(photo)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('the chip edge survives the hover state, where the glass goes fully white', () => {
    const hovered = WHITE;
    const edge = composite(CARD_INK, PHOTO_CHROME_EDGE_ALPHA, hovered);
    expect(contrastRatio(rgbToHex(edge), rgbToHex(hovered))).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

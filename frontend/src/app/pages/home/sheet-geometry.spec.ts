import { describe, expect, it } from 'vitest';

import { clampLift, detentAt, offsetFor, sheetTop, sheetTops } from './sheet-geometry';

/**
 * The sheet's rest points, from the chrome as measured at runtime: a 44 px sliver of map at
 * full, Airbnb's measured 307 px band at half, the 78 px head alone at peek.
 */
describe('sheet geometry', () => {
  const phone = sheetTops({ viewportH: 844, header: 73, tabBar: 61 });
  const tablet = sheetTops({ viewportH: 1024, header: 73, tabBar: 0 });

  it('rests the sheet on the measured chrome: a 44 px sliver at full, 307 px of map at half, the head alone at peek', () => {
    expect(phone).toEqual({ full: 117, half: 380, peek: 705, sheetHeight: 666 });
  });

  it('reserves nothing for a tab bar that measures 0 (the tablet band, sm:hidden)', () => {
    expect(tablet).toEqual({ full: 117, half: 380, peek: 946, sheetHeight: 907 });
  });

  it('measures the scroller offset of each rest from the spacer the sheet scrolls over', () => {
    expect(offsetFor(phone, 'peek')).toBe(0);
    expect(offsetFor(phone, 'half')).toBe(325);
    expect(offsetFor(phone, 'full')).toBe(588);
  });

  it('names the nearest rest for a scroll position, half way between two rests deciding', () => {
    expect(detentAt(0, phone)).toBe('peek');
    expect(detentAt(162, phone)).toBe('peek');
    expect(detentAt(163, phone)).toBe('half');
    expect(detentAt(325, phone)).toBe('half');
    expect(detentAt(456, phone)).toBe('half');
    expect(detentAt(457, phone)).toBe('full');
    expect(detentAt(588, phone)).toBe('full');
    expect(detentAt(900, phone)).toBe('full');
  });

  it('places the sheet top at peek less the scroll, never above full', () => {
    expect(sheetTop(phone, 0)).toBe(705);
    expect(sheetTop(phone, 325)).toBe(380);
    expect(sheetTop(phone, 588)).toBe(117);
    expect(sheetTop(phone, 700)).toBe(117);
  });

  it('clamps the preview lift as a scroller clamps: never negative, never past the list end', () => {
    expect(clampLift(200, 1400, 600)).toBe(200);
    expect(clampLift(-30, 1400, 600)).toBe(0);
    expect(clampLift(900, 1400, 600)).toBe(800);
    expect(clampLift(120, 300, 600)).toBe(0);
  });
});

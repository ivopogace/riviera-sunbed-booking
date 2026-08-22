import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DESCRIPTIVE_CHIPS } from '../../testing/chip-fills';
import { AmenityChip } from './amenity-chip';

const [NEUTRAL, WATER] = DESCRIPTIVE_CHIPS;

@Component({
  imports: [AmenityChip],
  template: `
    <span appAmenityChip data-testid="plain">WiFi</span>
    <span appAmenityChip water data-testid="water">8m to water</span>
  `,
})
class Host {}

describe('AmenityChip', () => {
  function chips(): { plain: HTMLElement; water: HTMLElement } {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {
      plain: root.querySelector('[data-testid="plain"]')!,
      water: root.querySelector('[data-testid="water"]')!,
    };
  }

  it('keeps the .amenity-chip marker class + neutral fill on the default tag', () => {
    const { plain } = chips();
    expect(plain.classList.contains('amenity-chip')).toBe(true);
    expect(plain.classList.contains('amenity-chip--water')).toBe(false);
    expect(plain.classList.contains(`bg-[${NEUTRAL.fill}]`)).toBe(true);
    expect(plain.classList.contains(`text-[${NEUTRAL.ink}]`)).toBe(true);
    expect(plain.classList.contains('font-semibold')).toBe(true);
  });

  it('adds the --water marker + accent fill on the water tag', () => {
    const { water } = chips();
    expect(water.classList.contains('amenity-chip')).toBe(true);
    expect(water.classList.contains('amenity-chip--water')).toBe(true);
    expect(water.classList.contains(`bg-[${WATER.fill}]`)).toBe(true);
    expect(water.classList.contains(`text-[${WATER.ink}]`)).toBe(true);
    expect(water.classList.contains('font-bold')).toBe(true);
    // The neutral fill must NOT leak onto the water variant.
    expect(water.classList.contains(`bg-[${NEUTRAL.fill}]`)).toBe(false);
  });

  it('is fully enumerated by the shared descriptive list, which the contrast specs read', () => {
    // Two is complete because `water` is the only variant axis and it is boolean, so a third variant means a new input — and this line is what makes you extend the shared list at the same time.
    expect(DESCRIPTIVE_CHIPS).toHaveLength(2);
  });
});

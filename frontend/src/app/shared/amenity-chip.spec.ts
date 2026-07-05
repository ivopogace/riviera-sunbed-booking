import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AmenityChip } from './amenity-chip';

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
    expect(plain.classList.contains('bg-[#eef2f4]')).toBe(true);
    expect(plain.classList.contains('font-semibold')).toBe(true);
  });

  it('adds the --water marker + accent fill on the water tag', () => {
    const { water } = chips();
    expect(water.classList.contains('amenity-chip')).toBe(true);
    expect(water.classList.contains('amenity-chip--water')).toBe(true);
    expect(water.classList.contains('bg-[#d7eef4]')).toBe(true);
    expect(water.classList.contains('font-bold')).toBe(true);
    // The neutral fill must NOT leak onto the water variant.
    expect(water.classList.contains('bg-[#eef2f4]')).toBe(false);
  });
});

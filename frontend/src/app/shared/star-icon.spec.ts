import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { iconContract } from '../../testing/icon-contract';
import { STAR_FILL, StarIcon } from './star-icon';

@Component({
  imports: [StarIcon],
  template: `<app-star-icon [class]="STAR_FILL" /><app-star-icon />`,
})
class HostSpec {
  protected readonly STAR_FILL = STAR_FILL;
}

describe('StarIcon', () => {
  iconContract(StarIcon, 13);

  it('draws an outline by default, so a filled star is only ever the call site filling it', () => {
    const fixture = TestBed.createComponent(StarIcon);
    fixture.detectChanges();
    const svg = (fixture.nativeElement as HTMLElement).querySelector('svg')!;

    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.querySelectorAll('path')).toHaveLength(1);
  });

  it('keeps its own host class beside the fill a call site binds', () => {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    const [filled, outline] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-star-icon'),
    );

    expect(filled.classList.contains('contents')).toBe(true);
    expect(filled.classList.contains(STAR_FILL)).toBe(true);
    expect(outline.classList.contains(STAR_FILL)).toBe(false);
  });
});

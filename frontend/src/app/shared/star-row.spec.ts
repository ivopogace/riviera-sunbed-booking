import { TestBed } from '@angular/core/testing';

import { STAR_FILL } from './star-icon';
import { StarRow } from './star-row';

describe('StarRow', () => {
  function render(stars: number): HTMLElement {
    const fixture = TestBed.createComponent(StarRow);
    fixture.componentRef.setInput('stars', stars);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function fills(host: HTMLElement): boolean[] {
    return Array.from(host.querySelectorAll('app-star-icon')).map((star) =>
      star.classList.contains(STAR_FILL),
    );
  }

  it('fills as many of the five stars as the rating, outlining the rest', () => {
    expect(fills(render(4))).toEqual([true, true, true, true, false]);
    expect(fills(render(1))).toEqual([true, false, false, false, false]);
    expect(fills(render(5))).toEqual([true, true, true, true, true]);
  });

  it('is decorative: the wrapper that places it carries the accessible name', () => {
    const host = render(3);
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.textContent?.trim()).toBe('');
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SkeletonBlock } from './skeleton-block';

@Component({
  imports: [SkeletonBlock],
  template: `<span appSkeletonBlock class="h-3 w-1/2 rounded-[6px]" data-testid="host"></span>`,
})
class Host {}

describe('SkeletonBlock', () => {
  function host(): HTMLElement {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="host"]',
    )!;
  }

  it('pulses', () => {
    expect(host().classList.contains('animate-pulse')).toBe(true);
  });

  it('sets no fill: the track colour depends on the surface under the block (#744)', () => {
    const own = [...host().classList].filter(
      (cls) => !['h-3', 'w-1/2', 'rounded-[6px]'].includes(cls),
    );
    expect(own.some((cls) => cls.startsWith('bg-'))).toBe(false);
  });

  it('stops pulsing under reduced motion (#744 — the pairing is why this is a directive)', () => {
    expect(host().classList.contains('motion-reduce:animate-none')).toBe(true);
  });

  it('sets no radius, so the call site owns its own shape (riviera-tailwind rule 3)', () => {
    const own = [...host().classList].filter(
      (cls) => !['h-3', 'w-1/2', 'rounded-[6px]'].includes(cls),
    );
    expect(own.some((cls) => cls.startsWith('rounded'))).toBe(false);
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PhotoScrim } from './photo-scrim';

@Component({
  imports: [PhotoScrim],
  template: `<span appPhotoScrim data-testid="host"></span>`,
})
class Host {}

describe('PhotoScrim', () => {
  function host(): HTMLElement {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="host"]',
    )!;
  }

  it('applies the whole scrim recipe to the host', () => {
    const el = host();
    for (const cls of [
      // The marker the specs and the e2e query (riviera-tailwind rule 2) — inert, styling is beside it.
      'photo-scrim',
      // The class that drifted: the Discover card gained it in #1044, the banner only in #1064.
      'pointer-events-none',
      'absolute',
      'inset-0',
      'bg-(image:--riv-photo-scrim)',
    ]) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  it('hides itself from assistive tech', () => {
    // Decorative paint with no content and nothing focusable — both call sites set this by hand
    // before the directive existed, which made it one more thing two spans could disagree about.
    expect(host().getAttribute('aria-hidden')).toBe('true');
  });

  it('carries no border-radius and no padding of its own (rule 3)', () => {
    // riviera-tailwind rule 3: two competing border-radius utilities resolve by generated-stylesheet
    // order, not `class` order, so a surface directive never ships one. Padding is the same trap —
    // and on a scrim it would also break `inset-0`'s promise to cover the parent exactly.
    const own = [...host().classList];
    expect(own.filter((c) => c.startsWith('rounded'))).toEqual([]);
    expect(own.filter((c) => /^p[xytrbles]?-/.test(c))).toEqual([]);
  });
});

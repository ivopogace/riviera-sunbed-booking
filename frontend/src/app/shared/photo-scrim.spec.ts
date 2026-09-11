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
      // An inert marker the specs and the e2e query; the styling sits beside it (rule 2).
      'photo-scrim',
      // Paint only: a band's own controls must stay tappable under the wash.
      'pointer-events-none',
      'absolute',
      'inset-0',
      'bg-(image:--riv-photo-scrim)',
    ]) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  it('hides itself from assistive tech', () => {
    // Decorative paint, with no content of its own and nothing focusable inside it.
    expect(host().getAttribute('aria-hidden')).toBe('true');
  });

  it('carries no border-radius and no padding of its own (rule 3)', () => {
    // Rule 3: competing radius utilities resolve by stylesheet order, so a surface directive ships none.
    const own = [...host().classList];
    expect(own.filter((c) => c.startsWith('rounded'))).toEqual([]);
    expect(own.filter((c) => /^p[xytrbles]?-/.test(c))).toEqual([]);
  });
});

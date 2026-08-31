import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CardGlass } from './card-glass';

@Component({
  imports: [CardGlass],
  template: `<article appCardGlass data-testid="host"></article>`,
})
class Host {}

describe('CardGlass', () => {
  function host(): HTMLElement {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="host"]',
    )!;
  }

  it('applies the card-glass surface utilities to the host', () => {
    const el = host();
    for (const cls of [
      'bg-riv-card-glass',
      'border',
      'border-riv-card-border',
      'text-riv-card-ink',
    ]) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });
});

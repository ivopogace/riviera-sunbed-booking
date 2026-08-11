import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FieldGlass } from './field-glass';

@Component({
  imports: [FieldGlass],
  template: `<input appFieldGlass class="rounded-[14px] px-[13px] py-[11px]" data-testid="host" />`,
})
class Host {}

describe('FieldGlass', () => {
  function host(): HTMLElement {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="host"]',
    ) as HTMLElement;
  }

  it('applies the field-glass surface utilities to the host', () => {
    const el = host();
    for (const cls of [
      'bg-(--riv-field-fill)',
      'border',
      'border-(--riv-field-border)',
      'text-(--riv-card-ink)',
    ]) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  it('sets no border-radius or padding, so each consumer keeps its own', () => {
    // rule 3: competing radius utilities resolve by stylesheet order, so a baked-in one is a coin-flip.
    const el = host();
    const own = ['rounded-[14px]', 'px-[13px]', 'py-[11px]'];
    const added = [...el.classList].filter((c) => !own.includes(c));
    expect(added.some((c) => c.startsWith('rounded-'))).toBe(false);
    expect(added.some((c) => /^p[xytblr]?-/.test(c))).toBe(false);
  });
});

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
    return fixture.nativeElement.querySelector('[data-testid="host"]') as HTMLElement;
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
    // riviera-tailwind rule 3: two competing radius utilities resolve by stylesheet order, not class
    // order, so a radius baked into a shared surface directive is a coin-flip against the consumer's.
    const el = host();
    expect([...el.classList].some((c) => c.startsWith('rounded-') && c !== 'rounded-[14px]')).toBe(
      false,
    );
    expect([...el.classList].some((c) => /^p[xytblr]?-/.test(c) && !c.startsWith('px-[13px]') && !c.startsWith('py-[11px]'))).toBe(false);
  });
});

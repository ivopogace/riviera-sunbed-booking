import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PanelGlass } from './panel-glass';

@Component({
  imports: [PanelGlass],
  template: `<header appPanelGlass data-testid="host"></header>`,
})
class Host {}

describe('PanelGlass', () => {
  function host(): HTMLElement {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="host"]',
    ) as HTMLElement;
  }

  it('applies the panel-glass surface utilities to the host', () => {
    const el = host();
    for (const cls of [
      'bg-(--riv-header-glass)',
      'backdrop-blur-[22px]',
      'backdrop-saturate-[1.7]',
      'border',
      'border-(--riv-header-border)',
    ]) {
      expect(el.classList.contains(cls)).toBe(true);
    }
  });

  it('does not bundle a border-radius (each consumer sets its own)', () => {
    const el = host();
    expect([...el.classList].some((c) => c.startsWith('rounded'))).toBe(false);
  });
});

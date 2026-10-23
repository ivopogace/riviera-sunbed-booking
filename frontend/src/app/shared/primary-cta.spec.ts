import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PrimaryCta } from './primary-cta';

@Component({
  imports: [PrimaryCta],
  template: `
    <button appPrimaryCta type="button" class="rounded-2xl px-4" data-testid="button">Go</button>
    <a appPrimaryCta href="/" [class]="extra" data-testid="link">Go</a>
  `,
})
class Host {
  protected readonly extra = 'block p-[15px]';
}

const SKIN = [
  'border',
  'border-riv-cta-border',
  'bg-(image:--riv-cta-grad)',
  'text-white',
  'inset-shadow-[0_1px_0_rgba(255,255,255,0.5)]',
  'hover:not-disabled:not-aria-disabled:brightness-[1.06]',
];

describe('PrimaryCta', () => {
  function render(): HTMLElement {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('skins a button and keeps its own utilities', () => {
    const button = render().querySelector<HTMLElement>('[data-testid="button"]')!;

    for (const cls of [...SKIN, 'rounded-2xl', 'px-4']) {
      expect(button.classList, cls).toContain(cls);
    }
  });

  it('skins a link alongside a [class] binding', () => {
    const link = render().querySelector<HTMLElement>('[data-testid="link"]')!;

    for (const cls of [...SKIN, 'block', 'p-[15px]']) {
      expect(link.classList, cls).toContain(cls);
    }
  });

  it('carries no radius, padding or drop shadow, which stay the call site’s', () => {
    const skin = SKIN.join(' ');

    expect(skin).not.toMatch(/(^|\s)(rounded|p[xytrbl]?-|shadow-)/);
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LegalMenuRows } from './legal-menu-rows';

@Component({
  imports: [LegalMenuRows],
  template: `<nav><app-legal-menu-rows variant="sheet" /></nav>`,
})
class SheetHost {}

@Component({
  imports: [LegalMenuRows],
  template: `<nav><app-legal-menu-rows variant="popover" /></nav>`,
})
class PopoverHost {}

describe('LegalMenuRows', () => {
  function menu(host: typeof SheetHost | typeof PopoverHost): HTMLElement {
    const fixture = TestBed.createComponent(host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rowsOf(host: typeof SheetHost | typeof PopoverHost): HTMLAnchorElement[] {
    return [...menu(host).querySelectorAll<HTMLAnchorElement>('a')];
  }

  it('renders the two documents in order, under the names their routes carry', () => {
    const [privacy, terms] = rowsOf(SheetHost);

    expect(privacy.getAttribute('href')).toBe('/legal/privacy');
    expect(privacy.textContent?.trim()).toBe('Privacy policy');
    expect(terms.getAttribute('href')).toBe('/legal/terms');
    expect(terms.textContent?.trim()).toBe('Terms of service');
  });

  it('opens both in a new tab, so a mounted Payment Element survives the read', () => {
    for (const row of rowsOf(PopoverHost)) {
      expect(row.getAttribute('target'), row.textContent ?? '').toBe('_blank');
      expect(row.getAttribute('rel'), row.textContent ?? '').toBe('noopener');
    }
  });

  it('wears the sheet rows the phone menu paints, at the 44px floor', () => {
    for (const row of rowsOf(SheetHost)) {
      expect(row.className).toContain('text-[15.5px]');
      // `block` + the directive's min-h-11: the rendered box is e2e's to measure, not this spec's.
      expect(row.className).toContain('min-h-11');
      expect(row.className).toContain('block');
    }
  });

  it('wears the popover rows the header menu paints, at the 44px floor', () => {
    for (const row of rowsOf(PopoverHost)) {
      expect(row.className).toContain('text-[14px]');
      expect(row.className).toContain('min-h-11');
      expect(row.className).toContain('block');
    }
  });

  it('lays the rows out where the menu puts them, never a wrapper', () => {
    const host = menu(SheetHost).querySelector('app-legal-menu-rows');

    expect(host?.classList.contains('contents')).toBe(true);
  });
});

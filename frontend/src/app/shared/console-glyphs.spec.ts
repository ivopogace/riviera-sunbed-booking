import { Component, reflectComponentType, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CONSOLE_GLYPHS, DailyGlyph, MoreGlyph, SearchGlyph } from './console-glyphs';

const SVG_NS = 'http://www.w3.org/2000/svg';

@Component({
  imports: [DailyGlyph],
  template: `<a class="flex flex-col items-center [&_svg]:size-[21px]">
    <app-daily-glyph />
    <span>Daily</span>
  </a>`,
})
class HostSpec {}

/**
 * The console's glyph set — one component per destination plus More, venues, admin and search — held to
 * the `clock-icon.ts` contract (`riviera-tailwind` ICON-1..6): hidden from assistive tech at the
 * host and the svg, `display: contents`, geometry in the SVG namespace on `currentColor`, sized by
 * presentation attributes a call-site class outranks. Every case runs over the whole set, so a glyph
 * added later is held to it without a spec edit.
 */
describe('console glyphs', () => {
  function render(glyph: Type<unknown>): HTMLElement {
    const fixture = TestBed.createComponent(glyph);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function svgOf(host: HTMLElement): SVGSVGElement {
    return host.querySelector<SVGSVGElement>('svg')!;
  }

  /** The selector, not the class name — the builder mangles class names. */
  function selectorOf(glyph: Type<unknown>): string {
    return reflectComponentType(glyph)!.selector;
  }

  it('exposes one glyph per venue and admin destination plus More, venues, admin and search', () => {
    expect(CONSOLE_GLYPHS.map(selectorOf).sort()).toEqual(
      [
        'app-admin-glyph',
        'app-audit-glyph',
        'app-beach-map-glyph',
        'app-commissions-glyph',
        'app-daily-glyph',
        'app-email-glyph',
        'app-more-glyph',
        'app-operators-glyph',
        'app-payouts-glyph',
        'app-photos-glyph',
        'app-pricing-glyph',
        'app-privacy-glyph',
        'app-refunds-glyph',
        'app-requests-glyph',
        'app-reviews-glyph',
        'app-search-glyph',
        'app-venue-glyph',
        'app-venues-glyph',
      ].sort(),
    );
  });

  for (const glyph of CONSOLE_GLYPHS) {
    describe(selectorOf(glyph), () => {
      it('hides itself from assistive tech at the host AND at the inner svg', () => {
        const host = render(glyph);
        expect(host.getAttribute('aria-hidden')).toBe('true');
        expect(svgOf(host).getAttribute('aria-hidden')).toBe('true');
      });

      it('drops its host out of layout so the svg is what the slot lays out', () => {
        expect(render(glyph).classList.contains('contents')).toBe(true);
      });

      it('renders its geometry in the SVG namespace, on currentColor, with no fill', () => {
        const svg = svgOf(render(glyph));
        expect(svg.namespaceURI).toBe(SVG_NS);
        expect(svg.getAttribute('stroke')).toBe('currentColor');
        expect(svg.getAttribute('fill')).toBe('none');
        const shapes = svg.querySelectorAll('path, circle, rect');
        expect(shapes.length).toBeGreaterThan(0);
        for (const shape of shapes) {
          expect(shape.namespaceURI).toBe(SVG_NS);
        }
      });

      it('sizes itself with presentation attributes, which every call-site class outranks', () => {
        const svg = svgOf(render(glyph));
        expect(svg.getAttribute('width')).toBe('18');
        expect(svg.getAttribute('height')).toBe('18');
        expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
        expect(svg.getAttribute('class') ?? '').not.toMatch(/(^|\s)size-/);
      });
    });
  }

  it('merges its host class with the one the call site writes, and contributes no text', () => {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    const slot = (fixture.nativeElement as HTMLElement).querySelector('a')!;
    const host = slot.querySelector('app-daily-glyph')!;

    expect(host.classList.contains('contents')).toBe(true);
    expect(slot.classList.contains('[&_svg]:size-[21px]')).toBe(true);
    expect(slot.textContent?.trim()).toBe('Daily');
  });

  it('draws More as three dots, distinct from every destination glyph', () => {
    const more = svgOf(render(MoreGlyph));
    expect(more.querySelectorAll('circle')).toHaveLength(3);
  });

  it('draws Search as a lens — one circle and a handle — the palette trigger (#1013)', () => {
    const search = svgOf(render(SearchGlyph));
    expect(search.querySelectorAll('circle')).toHaveLength(1);
    expect(search.querySelectorAll('path')).toHaveLength(1);
  });
});

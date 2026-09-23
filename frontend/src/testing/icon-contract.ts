import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The `riviera-tailwind` ICON-1..6 contract every `shared/*-icon.ts` keeps, as one set of specs an
 * icon's own `*.spec.ts` runs with its default size. A glyph-specific claim (a fill that sets a
 * drawing apart, a call site's merged class) stays in that spec beside this call.
 */
export function iconContract(icon: Type<unknown>, defaultSize: number): void {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(icon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function svgOf(host: HTMLElement): SVGSVGElement {
    return host.querySelector<SVGSVGElement>('svg')!;
  }

  describe('the ICON-1..6 contract', () => {
    it('hides itself from assistive tech at the host AND at the inner svg', () => {
      const host = render();
      expect(host.getAttribute('aria-hidden')).toBe('true');
      expect(svgOf(host).getAttribute('aria-hidden')).toBe('true');
    });

    it('drops its host out of layout so the svg is what the call site lays out', () => {
      expect(render().classList.contains('contents')).toBe(true);
    });

    it('renders its geometry in the SVG namespace, not the HTML one', () => {
      const svg = svgOf(render());
      expect(svg.namespaceURI).toBe(SVG_NS);
      for (const shape of Array.from(svg.querySelectorAll('*'))) {
        expect(shape.namespaceURI, shape.tagName).toBe(SVG_NS);
      }
    });

    it('takes its ink from the call site, naming no colour of its own', () => {
      const svg = svgOf(render());
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|--riv-/i);
    });

    it(`sizes itself at ${defaultSize} with presentation attributes, which every call-site class outranks`, () => {
      const svg = svgOf(render());
      expect(svg.getAttribute('width')).toBe(String(defaultSize));
      expect(svg.getAttribute('height')).toBe(String(defaultSize));
      expect(svg.getAttribute('class')).not.toMatch(/(^|\s)size-/);
    });

    it('contributes no text, so the control reads as its own words alone', () => {
      expect(render().textContent?.trim()).toBe('');
    });
  });
}

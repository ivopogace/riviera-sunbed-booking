import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MapIcon } from './map-icon';

const SVG_NS = 'http://www.w3.org/2000/svg';

@Component({
  imports: [MapIcon],
  template: `<button class="inline-flex items-center gap-2">
    <app-map-icon class="[&_svg]:size-[17px]" />
    <span>Show map</span>
  </button>`,
})
class HostSpec {}

describe('MapIcon', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(MapIcon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function svgOf(host: HTMLElement): SVGSVGElement {
    return host.querySelector<SVGSVGElement>('svg')!;
  }

  it('hides itself from assistive tech at the host AND at the inner svg', () => {
    const host = render();
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(svgOf(host).getAttribute('aria-hidden')).toBe('true');
  });

  it('drops its host out of layout so the svg stays the direct flex child of the control', () => {
    expect(render().classList.contains('contents')).toBe(true);
  });

  it('renders its geometry in the SVG namespace, not the HTML one', () => {
    const svg = svgOf(render());
    expect(svg.namespaceURI).toBe(SVG_NS);
    for (const shape of Array.from(svg.children)) {
      expect(shape.namespaceURI, shape.tagName).toBe(SVG_NS);
    }
  });

  it('takes its ink from the control, naming no colour of its own', () => {
    const svg = svgOf(render());
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|--riv-/i);
  });

  it('sizes itself with presentation attributes, which every call-site class outranks', () => {
    const svg = svgOf(render());
    expect(svg.getAttribute('width')).toBe('16');
    expect(svg.getAttribute('height')).toBe('16');
    expect(svg.getAttribute('class')).not.toMatch(/(^|\s)size-/);
  });

  it('merges its host class with the one the call site writes', () => {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    const host = (fixture.nativeElement as HTMLElement).querySelector('app-map-icon')!;

    expect(host.classList.contains('contents')).toBe(true);
    expect(host.classList.contains('[&_svg]:size-[17px]')).toBe(true);
  });

  it('contributes no text, so the control reads as its own word alone', () => {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    const control = (fixture.nativeElement as HTMLElement).querySelector('button')!;

    expect(control.textContent?.trim()).toBe('Show map');
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ClockIcon } from './clock-icon';

const SVG_NS = 'http://www.w3.org/2000/svg';

@Component({
  imports: [ClockIcon],
  template: `<p class="inline-flex items-center gap-1">
    <app-clock-icon class="[&_svg]:size-[15px]" />
    <span>Book any day from tomorrow.</span>
  </p>`,
})
class HostSpec {}

describe('ClockIcon', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(ClockIcon);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function svgOf(host: HTMLElement): SVGSVGElement {
    return host.querySelector<SVGSVGElement>('svg')!;
  }

  it('hides itself from assistive tech at the host AND at the inner svg', () => {
    const host = render();
    // Both, deliberately: venue-map.spec.ts asserts the inner one; the host covers callers that don't.
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(svgOf(host).getAttribute('aria-hidden')).toBe('true');
  });

  it('drops its host out of layout so the svg stays the direct flex child of the note', () => {
    expect(render().classList.contains('contents')).toBe(true);
  });

  it('renders the clock geometry in the SVG namespace, not the HTML one', () => {
    const svg = svgOf(render());
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.querySelector('circle')?.namespaceURI).toBe(SVG_NS);
    expect(svg.querySelector('path')?.namespaceURI).toBe(SVG_NS);
  });

  it('sizes itself with presentation attributes, which every call-site class outranks', () => {
    const svg = svgOf(render());
    expect(svg.getAttribute('width')).toBe('13');
    expect(svg.getAttribute('height')).toBe('13');
    expect(svg.getAttribute('class')).not.toMatch(/(^|\s)size-/);
  });

  it('merges its host class with the one the call site writes', () => {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    const host = (fixture.nativeElement as HTMLElement).querySelector('app-clock-icon')!;

    expect(host.classList.contains('contents')).toBe(true);
    expect(host.classList.contains('[&_svg]:size-[15px]')).toBe(true);
  });

  it('contributes no text, so a note reads as its sentence alone', () => {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    const note = (fixture.nativeElement as HTMLElement).querySelector('p')!;

    expect(note.textContent?.trim()).toBe('Book any day from tomorrow.');
  });
});

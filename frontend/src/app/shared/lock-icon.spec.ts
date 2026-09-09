import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LockIcon } from './lock-icon';

const SVG_NS = 'http://www.w3.org/2000/svg';

@Component({
  imports: [LockIcon],
  template: `<button type="button" class="relative">
    <app-lock-icon class="absolute top-0.5 right-0.5 [&_svg]:size-[9px]" />
    <span aria-hidden="true">3</span>
  </button>`,
})
class HostSpec {}

describe('LockIcon', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(LockIcon);
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

  it('drops its host out of layout so the svg is what the cell positions', () => {
    expect(render().classList.contains('contents')).toBe(true);
  });

  it('renders the padlock geometry in the SVG namespace on the current ink', () => {
    const svg = svgOf(render());
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.querySelector('rect')?.namespaceURI).toBe(SVG_NS);
    expect(svg.querySelector('path')?.namespaceURI).toBe(SVG_NS);
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });

  it('sizes itself with presentation attributes, which every call-site class outranks', () => {
    const svg = svgOf(render());
    expect(svg.getAttribute('width')).toBe('10');
    expect(svg.getAttribute('height')).toBe('10');
    expect(svg.getAttribute('class')).not.toMatch(/(^|\s)size-/);
  });

  it('merges its host class with the one the call site writes and contributes no text', () => {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    const host = button.querySelector('app-lock-icon')!;

    expect(host.classList.contains('contents')).toBe(true);
    expect(host.classList.contains('[&_svg]:size-[9px]')).toBe(true);
    expect(button.textContent?.trim()).toBe('3');
  });
});

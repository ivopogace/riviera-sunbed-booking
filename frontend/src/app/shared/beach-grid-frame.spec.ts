import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BeachGridFrame } from './beach-grid-frame';

/**
 * The shared sea-facing beach-grid frame. Verifies it renders the sea and promenade orientation banners
 * and projects the consumer's grid body between them — the chrome both the layout editor and the
 * Daily view tab consume.
 */
@Component({
  imports: [BeachGridFrame],
  template: `
    <app-beach-grid-frame testid="my-grid">
      <div data-testid="projected-body">rows go here</div>
    </app-beach-grid-frame>
  `,
})
class FrameHost {}

describe('BeachGridFrame (#175)', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(FrameHost);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the sea + promenade orientation banners', () => {
    const host = render();
    const text = host.textContent ?? '';
    expect(text).toContain('Facing the sea');
    expect(text).toContain('Promenade');
  });

  it('projects the consumer grid body inside the frame', () => {
    const host = render();
    const body = host.querySelector('[data-testid="projected-body"]');
    expect(body).toBeTruthy();
    // The projected body sits inside the frame's testid'd section.
    expect(
      host.querySelector('[data-testid="my-grid"] [data-testid="projected-body"]'),
    ).toBeTruthy();
  });

  it('points a drawn triangle up to the sea and down to the promenade, hidden from assistive tech', () => {
    const host = render();
    const sea = host.querySelector('.sea-banner app-triangle-icon')!;
    const promenade = host.querySelector('.promenade app-triangle-icon')!;

    expect(sea.getAttribute('aria-hidden')).toBe('true');
    expect(promenade.getAttribute('aria-hidden')).toBe('true');
    expect(sea.classList.contains('[&_svg]:rotate-180')).toBe(false);
    expect(promenade.classList.contains('[&_svg]:rotate-180')).toBe(true);
    expect(host.querySelector('.sea-banner')!.textContent?.trim()).toBe('Facing the sea');
  });
});

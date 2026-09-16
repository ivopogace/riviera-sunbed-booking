import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { VenueNotFound } from './venue-not-found';

describe('VenueNotFound', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(VenueNotFound);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function byId(host: HTMLElement, id: string): HTMLElement {
    const el = host.querySelector(`[data-testid="${id}"]`);
    expect(el, id).not.toBeNull();
    return el as HTMLElement;
  }

  it('offers the venue list and create-a-venue', () => {
    // #1127: the shell's copy sent the operator to create a venue, the tabs' to their venue list.
    // One surface owns the answer now, so it offers both rather than picking a side.
    const host = render();

    expect(byId(host, 'oc-invalid-venue').textContent?.trim()).toBe('Venue not found');
    expect(byId(host, 'oc-venue-list').getAttribute('href')).toBe('/operator');
    expect(byId(host, 'oc-invalid-create-venue').getAttribute('href')).toBe('/operator?create=1');
  });
});

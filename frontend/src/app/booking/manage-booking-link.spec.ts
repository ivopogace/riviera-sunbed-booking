import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ManageBookingLink } from './manage-booking-link';

@Component({
  imports: [ManageBookingLink],
  template: `<a appManageBookingLink href="/booking/ABC123" class="btn-primary"></a>`,
})
class Host {}

describe('ManageBookingLink', () => {
  function link(): HTMLAnchorElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('a')!;
  }

  it('labels the link in one voice, for every surface that mounts it', () => {
    expect(link().textContent?.trim()).toBe('View or manage this booking');
  });

  it('carries the shared test id', () => {
    expect(link().getAttribute('data-testid')).toBe('manage-link');
  });

  it('leaves the caller’s own anchor in place, keeping its page-scoped skin', () => {
    // Page-scoped skin: an anchor rendered from this component would miss the encapsulation stamp.
    const a = link();

    expect(a.tagName).toBe('A');
    expect(a.classList.contains('btn-primary')).toBe(true);
    expect(a.getAttribute('href')).toBe('/booking/ABC123');
  });
});

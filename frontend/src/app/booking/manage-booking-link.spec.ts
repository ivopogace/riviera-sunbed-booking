import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageBookingLink } from './manage-booking-link';

@Component({
  imports: [ManageBookingLink],
  template: `<app-manage-booking-link code="ABC123" skin="link" />`,
})
class Host {}

describe('ManageBookingLink', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter([])] }).compileComponents();
  });

  function link(): HTMLAnchorElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('a')!;
  }

  it('labels the link in one voice, for every surface that mounts it', () => {
    expect(link().textContent?.trim()).toBe('View or manage this booking');
  });

  it('routes to the booking’s own management page from its code', () => {
    expect(link().getAttribute('href')).toBe('/booking/ABC123');
  });

  it('wears the skin the call site asks for and carries the shared test id', () => {
    expect(link().classList.contains('link')).toBe(true);
    expect(link().getAttribute('data-testid')).toBe('manage-link');
  });

  it('drops its host out of layout, so the anchor stays the page’s own child', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const host = (fixture.nativeElement as HTMLElement).querySelector('app-manage-booking-link')!;

    expect(host.classList.contains('contents')).toBe(true);
  });
});

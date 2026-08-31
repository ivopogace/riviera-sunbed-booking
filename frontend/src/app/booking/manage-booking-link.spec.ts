import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageBookingLink, ManageBookingLinkVariant } from './manage-booking-link';

@Component({
  imports: [ManageBookingLink],
  template: `<app-manage-booking-link code="ABC123" [variant]="variant" />`,
})
class Host {
  variant: ManageBookingLinkVariant = 'primary';
}

describe('ManageBookingLink', () => {
  function render(variant: ManageBookingLinkVariant): HTMLElement {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.variant = variant;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function link(variant: ManageBookingLinkVariant = 'primary'): HTMLAnchorElement {
    return render(variant).querySelector('a')!;
  }

  it('labels the link in one voice, for every surface that mounts it', () => {
    expect(link().textContent?.trim()).toBe('View or manage this booking');
  });

  it('carries the shared test id on the anchor itself', () => {
    expect(link().getAttribute('data-testid')).toBe('manage-link');
  });

  it('owns its anchor and routes to the booking page from the given code', () => {
    expect(link().getAttribute('href')).toBe('/booking/ABC123');
  });

  it('keeps the host out of layout, so the caller’s card lays out the anchor', () => {
    const host = render('primary').querySelector('app-manage-booking-link')!;
    expect(host.classList.contains('contents')).toBe(true);
  });

  it('skins the anchor per variant: a block CTA on the pay page, a quiet link on confirmation', () => {
    const primary = link('primary');
    expect(primary.classList.contains('block')).toBe(true);
    expect(primary.classList.contains('w-full')).toBe(true);

    const quiet = link('link');
    expect(quiet.classList.contains('inline-block')).toBe(true);
    expect(quiet.classList.contains('block')).toBe(false);
  });
});

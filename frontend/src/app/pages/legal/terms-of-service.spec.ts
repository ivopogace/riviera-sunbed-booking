import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TermsOfService } from './terms-of-service';

/**
 * The draft terms-of-service page. Same draft-banner rule as the privacy page;
 * the cancellation copy must state the server-enforced rules generically (invariants #4/#10 —
 * cutoff the evening before, refunds computed server-side) without hardcoding a clock time the
 * backend makes configurable.
 */
describe('TermsOfService (draft legal page)', () => {
  let fixture: ComponentFixture<TermsOfService>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TermsOfService] }).compileComponents();
    fixture = TestBed.createComponent(TermsOfService);
    await fixture.whenStable();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the headline and the prominent draft banner', () => {
    expect(host().querySelector('h1')?.textContent).toContain('Terms of Service');
    const banner = host().querySelector('[data-testid="legal-draft-banner"]');
    expect(banner?.textContent).toContain('Draft');
  });

  it('states the cancellation rule as the-evening-before with server-computed refunds', () => {
    const cancellation = host().querySelector('[data-testid="terms-cancellation"]');
    expect(cancellation?.textContent).toContain('evening before');
    expect(cancellation?.textContent?.toLowerCase()).toContain('refund');
  });

  it('tells the guest the booking code is their proof of booking to keep private', () => {
    const code = host().querySelector('[data-testid="terms-booking-code"]');
    expect(code?.textContent?.toLowerCase()).toContain('booking code');
  });

  it('keeps the operating entity as a bracketed placeholder', () => {
    const entity = host().querySelector('[data-testid="terms-entity"]');
    expect(entity?.textContent).toContain('[');
  });
});

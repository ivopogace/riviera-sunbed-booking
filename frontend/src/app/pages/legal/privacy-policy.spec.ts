import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrivacyPolicy } from './privacy-policy';

/**
 * The draft privacy-policy page (#101 Slice 3). The DRAFT banner is load-bearing: the final
 * counsel-reviewed text is #101's human-gated remainder, so until it lands the page must
 * declare itself a draft with placeholder entities rather than pass as a binding policy.
 */
describe('PrivacyPolicy (draft legal page)', () => {
  let fixture: ComponentFixture<PrivacyPolicy>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PrivacyPolicy] }).compileComponents();
    fixture = TestBed.createComponent(PrivacyPolicy);
    await fixture.whenStable();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the headline and the prominent draft banner', () => {
    expect(host().querySelector('h1')?.textContent).toContain('Privacy Policy');
    const banner = host().querySelector('[data-testid="legal-draft-banner"]');
    expect(banner?.textContent).toContain('Draft');
    expect(banner?.textContent).toContain('not yet been reviewed');
  });

  it('names the guest data collected for a booking', () => {
    const collected = host().querySelector('[data-testid="privacy-data-collected"]');
    expect(collected?.textContent).toContain('name');
    expect(collected?.textContent).toContain('email');
    expect(collected?.textContent).toContain('phone');
  });

  it('states the right to erasure and the statutory-retention exception', () => {
    const rights = host().querySelector('[data-testid="privacy-rights"]');
    expect(rights?.textContent).toContain('erasure');
    expect(rights?.textContent?.toLowerCase()).toContain('retention');
  });

  it('keeps the controller as a bracketed placeholder, never a real-sounding entity', () => {
    const controller = host().querySelector('[data-testid="privacy-controller"]');
    expect(controller?.textContent).toContain('[');
    expect(controller?.textContent).toContain('sh.p.k.');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ForVenues } from './for-venues';

/**
 * The venue-owner page (#1736). Its commercial copy is the owner's decision under ADR-0029: no
 * commission and no payout named, no provider named, and the pay-into-your-own-account mechanics
 * under an "At launch" label until #284 ships.
 */
describe('ForVenues', () => {
  let fixture: ComponentFixture<ForVenues>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForVenues],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ForVenues);
    await fixture.whenStable();
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function section(testId: string): string {
    return (
      host().querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ??
      ''
    );
  }

  it('renders one headline for venue owners', () => {
    expect(host().querySelectorAll('h1')).toHaveLength(1);
    expect(host().querySelector('h1')?.textContent).toContain('beach venues');
  });

  it('lists what the venue gets', () => {
    const gets = section('for-venues-gets');
    expect(gets).toContain('beach map');
    expect(gets).toContain('walk-in');
    expect(gets).toContain('QR code');
    expect(gets).toContain('approve each booking');
  });

  it("states the price terms in the owner's words", () => {
    const price = section('for-venues-price');
    expect(price).toContain(
      'Free until 31 October 2028. No commission, no setup fee, no fee on walk-ins.',
    );
    expect(price).toContain(
      'After that, a flat seasonal subscription. We will announce the price at least 3 months ahead, and we will never take a cut of your bookings.',
    );
  });

  it('labels the money mechanics "At launch"', () => {
    expect(section('for-venues-at-launch')).toBe('At launch');
    expect(section('for-venues-money')).toContain(
      'Guests pay you directly, by card, into your own payment account. Riviera never holds your money, and there is nothing to pay out.',
    );
  });

  it('lists the four start steps in order', () => {
    const steps = [...host().querySelectorAll('[data-testid="for-venues-steps"] li')].map((li) =>
      li.textContent?.trim(),
    );
    expect(steps).toHaveLength(4);
    expect(steps[0]).toMatch(/^Register/);
    expect(steps[1]).toMatch(/approve/);
    expect(steps[2]).toMatch(/beach map/);
    expect(steps[3]).toMatch(/prices/);
  });

  it('names no commission rate, no payout cadence and no payment provider', () => {
    const text = host().textContent ?? '';
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/weekly|payout/i);
    expect(text).not.toMatch(/stripe|paysera|\bpok\b/i);
  });

  it('ends in the operator registration and links nowhere into the console', () => {
    const links = [...host().querySelectorAll<HTMLAnchorElement>('a')];
    const cta = host().querySelector<HTMLAnchorElement>('[data-testid="for-venues-register"]');
    expect(links.at(-1)).toBe(cta);
    expect(cta?.getAttribute('href')).toBe('/account/sign-in?audience=operator&mode=register');
    for (const link of links) {
      expect(link.getAttribute('href')).not.toMatch(/^\/operator|^\/admin/);
    }
  });
});

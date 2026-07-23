import { landingRouteFor, safeReturnUrl, touristLandingRoute } from './auth-landing';

const ONE = [{ id: 12 }];
const MANY = [{ id: 12 }, { id: 15 }];

describe('landingRouteFor', () => {
  it('honors returnUrl above every venue-count rule', () => {
    expect(landingRouteFor(ONE, '/operator/15/payouts')).toBe('/operator/15/payouts');
    expect(landingRouteFor(MANY, '/operator/15/payouts')).toBe('/operator/15/payouts');
    expect(landingRouteFor([], '/operator/15/payouts')).toBe('/operator/15/payouts');
  });

  it('sends a single-venue operator straight into that console', () => {
    expect(landingRouteFor(ONE, undefined)).toBe('/operator/12');
  });

  it('sends a multi-venue operator to the picker', () => {
    expect(landingRouteFor(MANY, undefined)).toBe('/operator');
  });

  it('sends an operator with no venue to onboarding', () => {
    expect(landingRouteFor([], undefined)).toBe('/venue-admin');
  });
});

describe('touristLandingRoute', () => {
  it('lands on home by default and honors a returnUrl deep link', () => {
    expect(touristLandingRoute(undefined)).toBe('/');
    expect(touristLandingRoute('/my-bookings')).toBe('/my-bookings');
  });
});

describe('safeReturnUrl', () => {
  it('accepts an in-app absolute path', () => {
    expect(safeReturnUrl('/operator/15/payouts')).toBe('/operator/15/payouts');
    expect(safeReturnUrl('/my-bookings?tab=past#top')).toBe('/my-bookings?tab=past#top');
  });

  it('rejects anything that could leave the app (open redirect)', () => {
    // returnUrl is attacker-controllable: never bounce off-origin after authenticating.
    expect(safeReturnUrl('https://evil.example/steal')).toBeUndefined();
    expect(safeReturnUrl('//evil.example/steal')).toBeUndefined();
    expect(safeReturnUrl('/\\evil.example')).toBeUndefined();
    expect(safeReturnUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeReturnUrl('operator/12')).toBeUndefined(); // relative — not an app route path
  });

  it('rejects empty and missing values', () => {
    expect(safeReturnUrl(undefined)).toBeUndefined();
    expect(safeReturnUrl('')).toBeUndefined();
    expect(safeReturnUrl('   ')).toBeUndefined();
  });

  it('is the gate the landing resolvers use', () => {
    // An unsafe returnUrl must fall through to the normal rule, never be returned.
    expect(landingRouteFor(ONE, 'https://evil.example/steal')).toBe('/operator/12');
    expect(landingRouteFor([], '//evil.example')).toBe('/venue-admin');
    expect(touristLandingRoute('https://evil.example')).toBe('/');
  });
});

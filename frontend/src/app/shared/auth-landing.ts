/**
 * Where a freshly signed-in principal lands — pure functions, no Angular, no HTTP, so the
 * whole decision table is unit-testable in isolation and the auth page, the operator guard and the
 * `/operator` home all agree by construction.
 *
 * Lives in `shared/` (pure, stateless) and therefore may not import `core/`; the operator rules take
 * the minimal structural shape below, which `core/owned-venues.ts`'s `OwnedVenue` satisfies without
 * either side importing the other.
 */

/** The only thing landing needs to know about an owned venue. */
export interface LandingVenue {
  readonly id: number;
}

/**
 * Validate an attacker-controllable `returnUrl` query param; trusting it raw is an open redirect
 * after sign-in. Returns it only if an in-app absolute path (a single leading `/`, never `//` or
 * `/\`, which browsers resolve as protocol-relative URLs to another host), else `undefined`.
 */
export function safeReturnUrl(returnUrl: string | undefined): string | undefined {
  const candidate = returnUrl?.trim();
  if (!candidate?.startsWith('/')) {
    return undefined; // missing, blank, relative ("operator/12"), or a scheme ("javascript:", "https:")
  }
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) {
    return undefined; // protocol-relative — "//evil.example" is a different origin
  }
  return candidate;
}

/**
 * The route a signed-in **operator** lands on: a safe `returnUrl` wins; otherwise exactly one owned
 * venue skips the picker (`/operator/{id}`), while several or none land on `/operator` (the picker,
 * or the zero state's inline create-venue form).
 */
export function landingRouteFor(
  venues: readonly LandingVenue[],
  returnUrl: string | undefined,
): string {
  const target = safeReturnUrl(returnUrl);
  if (target) {
    return target;
  }
  if (venues.length === 1) {
    return `/operator/${venues[0].id}`;
  }
  // 0 venues → still '/operator': the home renders the create form inline there.
  return '/operator';
}

/**
 * The route a signed-in **tourist** lands on: a safe `returnUrl` (a deep link hit while signed out —
 * e.g. `/my-bookings`) or the discover home. Same `returnUrl` contract as the operator side, so one
 * rule governs both audiences.
 */
export function touristLandingRoute(returnUrl: string | undefined): string {
  return safeReturnUrl(returnUrl) ?? '/';
}

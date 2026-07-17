import { Page } from '@playwright/test';

/** RFC-7807 body matching the backend contract (issue #97) — mocks must flush realistic shapes. */
function problem(status: number, title: string, code: string) {
  return {
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({
      type: 'about:blank',
      title,
      status,
      detail: '',
      code,
      instance: 'about:blank',
    }),
  };
}

/**
 * Stateful mock of the session-auth API (issue #109) for the CI-safe suite: a tiny in-memory
 * "session" that `/api/auth/me` reflects — so a reload realistically RESTORES a signed-in state
 * (AC-8) because routes persist across navigations within one Playwright page. Login succeeds
 * only for `validPassword` and answers the generic 401 otherwise (D-8); logout flips the state
 * back and answers 204 like the real LogoutFilter.
 */
export async function mockAuthApi(
  page: Page,
  options: { readonly validPassword: string; readonly username?: string },
): Promise<void> {
  const username = options.username ?? 'operator';
  let signedIn = false;

  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: { username, principalType: 'OPERATOR' } })
      : route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED')),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    const body = route.request().postDataJSON() as { username?: string; password?: string };
    if (body.username === username && body.password === options.validPassword) {
      signedIn = true;
      return route.fulfill({ json: { username, principalType: 'OPERATOR' } });
    }
    return route.fulfill(problem(401, 'Unauthorized', 'INVALID_CREDENTIALS'));
  });
  await page.route(/\/api\/auth\/logout$/, (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });
}

/**
 * Stateful mock of the CUSTOMER session-auth API (S2 #111) for the CI-safe suite. Mirrors
 * {@link mockAuthApi} but for the customer principal type + the register endpoint's D-8 semantics:
 * registration returns an identical 201 body whether the email is fresh or already taken, but only a
 * FRESH email establishes the session — so the FE learns "registered vs exists" from the subsequent
 * `/me`, exactly as against the real backend. Login succeeds only for `validPassword` (generic 401
 * otherwise); logout flips the state back and answers 204 like the real LogoutFilter.
 */
export async function mockCustomerAuthApi(
  page: Page,
  options: {
    readonly email: string;
    readonly validPassword: string;
    readonly takenEmails?: readonly string[];
  },
): Promise<void> {
  const email = options.email;
  const taken = new Set((options.takenEmails ?? []).map((e) => e.trim().toLowerCase()));
  let signedIn = false;

  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: { username: email, principalType: 'CUSTOMER' } })
      : route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED')),
  );

  await page.route(/\/api\/auth\/customer\/register$/, (route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    const entered = (body.email ?? '').trim().toLowerCase();
    // Non-enumerating (D-8): identical 201 body either way; a FRESH email additionally signs in.
    if (entered && !taken.has(entered)) {
      taken.add(entered);
      signedIn = true;
    }
    return route.fulfill({ status: 201, json: { username: body.email, principalType: 'CUSTOMER' } });
  });

  await page.route(/\/api\/auth\/customer\/login$/, (route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    if ((body.email ?? '').trim().toLowerCase() === email.toLowerCase() && body.password === options.validPassword) {
      signedIn = true;
      return route.fulfill({ json: { username: email, principalType: 'CUSTOMER' } });
    }
    return route.fulfill(problem(401, 'Unauthorized', 'INVALID_CREDENTIALS'));
  });

  await page.route(/\/api\/auth\/logout$/, (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });
}

/**
 * Stateful mock of the CUSTOMER SSO flow (S4 #112) for the CI-safe suite. The FE starts SSO with a
 * full-page navigation to `GET /api/auth/sso/{provider}/authorize`; here we intercept that navigation
 * and mimic the backend's completed OIDC dance — flip the in-memory session to the provider's canned
 * email and 302 back to the SPA root (`baseURL/`), where `restore()` reads `/api/auth/me` and shows the
 * signed-in tourist. A different provider signs in as a different account. Logout flips the state back.
 */
export async function mockCustomerSsoApi(
  page: Page,
  options: { readonly baseURL: string; readonly google: string; readonly apple: string },
): Promise<void> {
  const emailByProvider: Record<string, string> = { google: options.google, apple: options.apple };
  let signedInEmail: string | undefined;

  await page.route(/\/api\/auth\/me$/, (route) =>
    signedInEmail
      ? route.fulfill({ json: { username: signedInEmail, principalType: 'CUSTOMER' } })
      : route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED')),
  );

  await page.route(/\/api\/auth\/sso\/(google|apple)\/authorize$/, (route) => {
    const provider = /\/api\/auth\/sso\/(google|apple)\/authorize/.exec(route.request().url())?.[1];
    signedInEmail = provider ? emailByProvider[provider] : undefined;
    // The real backend completes the exchange server-side and returns to the SPA root with a session.
    return route.fulfill({ status: 302, headers: { location: `${options.baseURL}/` } });
  });

  await page.route(/\/api\/auth\/logout$/, (route) => {
    signedInEmail = undefined;
    return route.fulfill({ status: 204 });
  });
}

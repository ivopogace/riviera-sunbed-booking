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
 * Stateful mock of the OPERATOR self-registration → admin-approval → sign-in → create-venue lifecycle
 * (S6 #115) for the CI-safe suite. One in-memory model backs the whole flow so a single Playwright page
 * can drive it end to end:
 *
 * - `POST /api/auth/operator/register` always answers a byte-identical `202 {status:'PENDING'}`
 *   (non-enumeration, D-8); only a fresh username adds a PENDING row (carrying its password + contact
 *   email). No session is established — a PENDING operator cannot sign in.
 * - `POST /api/auth/operator/login` accepts the fixed ADMIN account (→ `admin:true`) and any APPROVED
 *   operator's own password (→ `admin:false`); everything else is the generic 401. `/api/auth/me`
 *   reflects the session incl. the `admin` flag the FE gates the approval surface on.
 * - `GET /api/admin/operators` lists the pending queue (admin only); `POST …/{id}/approve` moves that
 *   operator to APPROVED (so its login now works) and `…/{id}/reject` drops it (stays unable to log in);
 *   both `204`, unknown id `404`.
 * - `POST /api/venues` answers `201 {id}` (creator-owns-on-create is the backend's job — the mock just
 *   confirms the create the approved operator makes).
 */
export async function mockOperatorLifecycleApi(
  page: Page,
  options: { readonly admin: { readonly username: string; readonly password: string } },
): Promise<void> {
  const admin = options.admin;
  interface PendingOp {
    id: number;
    username: string;
    contactEmail: string;
    password: string;
    registeredAt: string;
  }
  const pending: PendingOp[] = [];
  const approved = new Map<string, string>(); // username -> password (login enabled once approved)
  let nextOpId = 1;
  let nextVenueId = 100;
  let session: { username: string; admin: boolean } | undefined;

  const principal = () =>
    session
      ? { username: session.username, principalType: 'OPERATOR', admin: session.admin }
      : undefined;

  await page.route(/\/api\/auth\/me$/, (route) =>
    session
      ? route.fulfill({ json: principal() })
      : route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED')),
  );

  await page.route(/\/api\/auth\/operator\/register$/, (route) => {
    const body = route.request().postDataJSON() as {
      username?: string;
      password?: string;
      contactEmail?: string;
    };
    const username = (body.username ?? '').trim();
    const known =
      !!username && (approved.has(username) || pending.some((p) => p.username === username));
    // Non-enumerating (D-8): always 202; only a fresh username adds a PENDING row (no session).
    if (username && !known) {
      pending.push({
        id: nextOpId++,
        username,
        contactEmail: (body.contactEmail ?? '').trim(),
        password: body.password ?? '',
        registeredAt: '2026-07-18T00:00:00Z',
      });
    }
    return route.fulfill({ status: 202, json: { status: 'PENDING' } });
  });

  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    const body = route.request().postDataJSON() as { username?: string; password?: string };
    const username = (body.username ?? '').trim();
    if (username === admin.username && body.password === admin.password) {
      session = { username: admin.username, admin: true };
      return route.fulfill({ json: principal() });
    }
    if (!!body.password && approved.get(username) === body.password) {
      session = { username, admin: false };
      return route.fulfill({ json: principal() });
    }
    return route.fulfill(problem(401, 'Unauthorized', 'INVALID_CREDENTIALS'));
  });

  await page.route(/\/api\/admin\/operators$/, (route) =>
    session?.admin
      ? route.fulfill({
          json: pending.map((p) => ({
            id: p.id,
            username: p.username,
            contactEmail: p.contactEmail,
            registeredAt: p.registeredAt,
          })),
        })
      : route.fulfill(problem(403, 'Forbidden', 'ACCESS_DENIED')),
  );

  const decide = (route: import('@playwright/test').Route, approve: boolean) => {
    if (!session?.admin) {
      return route.fulfill(problem(403, 'Forbidden', 'ACCESS_DENIED'));
    }
    const id = Number(/\/operators\/(\d+)\/(?:approve|reject)/.exec(route.request().url())?.[1]);
    const idx = pending.findIndex((p) => p.id === id);
    if (idx === -1) {
      return route.fulfill(problem(404, 'Not Found', 'NO_SUCH_OPERATOR'));
    }
    if (approve) {
      approved.set(pending[idx].username, pending[idx].password); // login now enabled
    }
    pending.splice(idx, 1); // approved or rejected → leaves the pending queue
    return route.fulfill({ status: 204 });
  };
  await page.route(/\/api\/admin\/operators\/\d+\/approve$/, (route) => decide(route, true));
  await page.route(/\/api\/admin\/operators\/\d+\/reject$/, (route) => decide(route, false));

  await page.route(/\/api\/venues$/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 201, json: { id: nextVenueId++ } })
      : route.fulfill({ json: [] }),
  );

  await page.route(/\/api\/auth\/logout$/, (route) => {
    session = undefined;
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

/**
 * Stateful mock of the CUSTOMER account-recovery API (S8 #113) for the CI-safe suite: forgot-password
 * always answers a neutral 204 (non-enumeration, D-8); reset-password + verify-email accept only
 * `validToken`, else the generic 400 `INVALID_OR_EXPIRED_TOKEN`. A successful reset rotates the mock's
 * accepted password AND signs the session out (the real reset invalidates sessions, AC-3); a successful
 * verify flips `emailVerified`, which `/me` + login then reflect. Login succeeds for the CURRENT password
 * only — so the reset e2e can prove the old password stops working and the new one starts.
 */
export async function mockCustomerRecoveryApi(
  page: Page,
  options: {
    readonly email: string;
    readonly initialPassword: string;
    readonly validToken: string;
  },
): Promise<void> {
  const { email, validToken } = options;
  let password = options.initialPassword;
  let signedIn = false;
  let emailVerified = false;

  const principal = () => ({ username: email, principalType: 'CUSTOMER', emailVerified });

  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: principal() })
      : route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED')),
  );

  await page.route(/\/api\/auth\/customer\/login$/, (route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    if ((body.email ?? '').trim().toLowerCase() === email.toLowerCase() && body.password === password) {
      signedIn = true;
      return route.fulfill({ json: principal() });
    }
    return route.fulfill(problem(401, 'Unauthorized', 'INVALID_CREDENTIALS'));
  });

  await page.route(/\/api\/auth\/customer\/forgot-password$/, (route) =>
    route.fulfill({ status: 204 }),
  );

  await page.route(/\/api\/auth\/customer\/reset-password$/, (route) => {
    const body = route.request().postDataJSON() as { token?: string; newPassword?: string };
    if (body.token === validToken && body.newPassword) {
      password = body.newPassword;
      signedIn = false; // a reset invalidates existing sessions (AC-3)
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(problem(400, 'Bad Request', 'INVALID_OR_EXPIRED_TOKEN'));
  });

  await page.route(/\/api\/auth\/customer\/verify-email$/, (route) => {
    const body = route.request().postDataJSON() as { token?: string };
    if (body.token === validToken) {
      emailVerified = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(problem(400, 'Bad Request', 'INVALID_OR_EXPIRED_TOKEN'));
  });

  await page.route(/\/api\/auth\/logout$/, (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });
}

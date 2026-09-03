import { Page } from '@playwright/test';

/** RFC-7807 body matching the backend contract — mocks must flush realistic shapes. */
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
 * The server's password policy (D-8) as the mocked endpoints answer it: 12 characters to 72 bytes →
 * `INVALID_REQUEST`; the service name or the account's own name in the password →
 * `PASSWORD_CONTAINS_BLOCKED_TERM`, its own code. Undefined when the password passes.
 */
function passwordPolicyProblem(
  newPassword: string,
  accountName: string,
): ReturnType<typeof problem> | undefined {
  if (newPassword.length < 12 || new TextEncoder().encode(newPassword).length > 72) {
    return problem(400, 'Bad Request', 'INVALID_REQUEST');
  }
  const lower = newPassword.toLowerCase();
  if (
    lower.includes('riviera') ||
    (accountName.length >= 3 && lower.includes(accountName.toLowerCase()))
  ) {
    return problem(400, 'Bad Request', 'PASSWORD_CONTAINS_BLOCKED_TERM');
  }
  return undefined;
}

/**
 * Stateful mock of the session-auth API for the CI-safe suite: a tiny in-memory
 * "session" that `/api/auth/me` reflects — so a reload realistically RESTORES a signed-in state,
 * because routes persist across navigations within one Playwright page. Login succeeds
 * only for the CURRENT password — which starts as `validPassword` and is ROTATED by the
 * self-service change endpoint, so a spec can prove the old credential stops working and the new
 * one starts. Everything else answers the generic 401 (D-8); logout flips the state back and
 * answers 204 like the real LogoutFilter.
 */
export async function mockAuthApi(
  page: Page,
  options: {
    readonly validPassword: string;
    readonly username?: string;
    /** The operator's venues for the post-sign-in landing read; defaults to one (straight into its console). */
    readonly venues?: readonly { id: number; name: string; beach: string }[];
    /**
     * Marks this account as the env-managed bootstrap admin, whose password lives in
     * `RIVIERA_OPERATOR_PASSWORD` — its change attempts answer `409 BOOTSTRAP_CREDENTIAL_MANAGED`.
     */
    readonly envManaged?: boolean;
  },
): Promise<void> {
  const username = options.username ?? 'operator';
  let password = options.validPassword;
  let signedIn = false;

  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: { username, principalType: 'OPERATOR', operatorStatus: 'ACTIVE' } })
      : route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED')),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    const body = route.request().postDataJSON() as { username?: string; password?: string };
    if (body.username === username && body.password === password) {
      signedIn = true;
      return route.fulfill({
        json: { username, principalType: 'OPERATOR', operatorStatus: 'ACTIVE' },
      });
    }
    return route.fulfill(problem(401, 'Unauthorized', 'INVALID_CREDENTIALS'));
  });

  // Self-service credential rotation. Branch order mirrors the controller: the env-managed
  // bootstrap admin is refused BEFORE the policy check and before the stored credential is read.
  await page.route(/\/api\/auth\/operator\/password$/, (route) => {
    if (!signedIn) {
      return route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED'));
    }
    if (options.envManaged) {
      return route.fulfill(problem(409, 'Conflict', 'BOOTSTRAP_CREDENTIAL_MANAGED'));
    }
    const body = route.request().postDataJSON() as {
      currentPassword?: string;
      newPassword?: string;
    };
    // Outranks the policy check below, as in the controller, and carries its own code.
    if (!body.currentPassword) {
      return route.fulfill(problem(400, 'Bad Request', 'MISSING_CURRENT_PASSWORD'));
    }
    // Policy BEFORE the credential check, and bytes not characters — both mirror the controller, which
    // calls PasswordPolicy.validate ahead of findByUsername and caps at bcrypt's 72-byte input limit.
    // Reversing either lets the mocked suite stay green through a real reordering.
    const newPassword = body.newPassword ?? '';
    const policyProblem = passwordPolicyProblem(newPassword, username);
    if (policyProblem) {
      return route.fulfill(policyProblem);
    }
    if (body.currentPassword !== password) {
      return route.fulfill(problem(400, 'Bad Request', 'INVALID_CURRENT_PASSWORD'));
    }
    // The server revokes the operator's OTHER sessions only — the calling one deliberately survives.
    password = newPassword;
    return route.fulfill({ status: 204 });
  });

  await mockOwnedVenues(
    page,
    options.venues ?? [{ id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' }],
  );

  await page.route(/\/api\/auth\/logout$/, (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });
}

/**
 * The operator's own venues — `GET /api/venues/mine`, which the unified auth page consults
 * to decide where a signed-in operator lands (0 → onboarding, 1 → that console, 2+ → the picker).
 * Defaults to one venue, which reproduces the "straight into the console" behaviour that
 * most operator e2e specs assume.
 */
export async function mockOwnedVenues(
  page: Page,
  venues: readonly { id: number; name: string; beach: string }[],
): Promise<void> {
  await page.route(/\/api\/venues\/mine$/, (route) => route.fulfill({ json: venues }));
}

/** The header a fenced write carries its solved proof-of-work challenge in (`shared/challenge.ts`). */
export const CHALLENGE_HEADER = 'x-altcha-payload';

/** The three ways the edge refuses a fenced write for its challenge (`SecurityProblemResponses`). */
export type ChallengeCode = 'CHALLENGE_REQUIRED' | 'CHALLENGE_INVALID' | 'CHALLENGE_EXPIRED';

/** Handles into the mocked proof-of-work fence, for the specs that drive its failure paths. */
export interface ChallengeMock {
  /** How many challenges the page fetched so far — a refetch after a refusal shows up here. */
  fetches(): number;
  /** Make the next register answer this challenge code instead of registering. */
  refuseNextRegisterWith(code: ChallengeCode): void;
  /** The `solution.counter` of the last payload the register route accepted, or undefined. */
  lastSolvedCounter(): number | undefined;
}

/**
 * The widget's payload, decoded: the base64 JSON of `{ challenge, solution }` it sends after a real
 * solve in the browser. The mock's cost is tiny, so Chromium solves in milliseconds, but a solve it
 * is — a spec that reaches the register route with a counter proves the widget ran end to end.
 */
function solvedCounter(payload: string | undefined): number | undefined {
  if (!payload) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as {
      solution?: { counter?: number };
    };
    return typeof parsed.solution?.counter === 'number' ? parsed.solution.counter : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A v2 challenge as the platform issues one, unsigned — the widget never checks the signature (the
 * edge does), and a `cost` of 10 keeps the browser's solve instant.
 */
function challengeJson(): Record<string, unknown> {
  const hex = (bytes: number) =>
    Array.from({ length: bytes }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0'),
    ).join('');
  return {
    parameters: {
      algorithm: 'PBKDF2/SHA-256',
      cost: 10,
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      keyLength: 32,
      keyPrefix: '00',
      nonce: hex(16),
      salt: hex(16),
    },
    signature: 'mocked-signature',
  };
}

/**
 * Stateful mock of the CUSTOMER session-auth API for the CI-safe suite. Mirrors
 * {@link mockAuthApi} but for the customer principal type + the register endpoint's D-8 semantics:
 * registration returns an identical 201 body whether the email is fresh or already taken, but only a
 * FRESH email establishes the session — so the FE learns "registered vs exists" from the subsequent
 * `/me`, exactly as against the real backend. Login succeeds only for `validPassword` (generic 401
 * otherwise); logout flips the state back and answers 204 like the real LogoutFilter.
 *
 * <p>The proof-of-work fence is mocked too, on by default: `GET /api/auth/challenge` issues a
 * low-cost challenge the widget really solves, and register refuses a request without the solution
 * header with `CHALLENGE_REQUIRED` — so every register journey in the suite proves the widget ran.
 * `challenge: 'off'` answers `204` (the kill switch) and register admits a header-less request.
 */
export async function mockCustomerAuthApi(
  page: Page,
  options: {
    readonly email: string;
    readonly validPassword: string;
    readonly takenEmails?: readonly string[];
    readonly challenge?: 'on' | 'off';
  },
): Promise<ChallengeMock> {
  const email = options.email;
  const taken = new Set((options.takenEmails ?? []).map((e) => e.trim().toLowerCase()));
  const fenced = options.challenge !== 'off';
  let signedIn = false;
  let fetches = 0;
  let refuseWith: ChallengeCode | undefined;
  let lastCounter: number | undefined;

  await page.route(/\/api\/auth\/challenge$/, (route) => {
    fetches += 1;
    return fenced
      ? route.fulfill({ json: challengeJson(), headers: { 'cache-control': 'no-store' } })
      : route.fulfill({ status: 204 });
  });

  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: { username: email, principalType: 'CUSTOMER' } })
      : route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED')),
  );

  await page.route(/\/api\/auth\/customer\/register$/, (route) => {
    // The fence runs before the controller: a refusal writes nothing and signs nobody in.
    if (fenced) {
      const counter = solvedCounter(route.request().headers()[CHALLENGE_HEADER]);
      const code = refuseWith ?? (counter === undefined ? 'CHALLENGE_REQUIRED' : undefined);
      refuseWith = undefined;
      if (code) {
        return route.fulfill(problem(400, 'Bad Request', code));
      }
      lastCounter = counter;
    }
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    const entered = (body.email ?? '').trim().toLowerCase();
    // Non-enumerating (D-8): identical 201 body either way; a FRESH email additionally signs in.
    if (entered && !taken.has(entered)) {
      taken.add(entered);
      signedIn = true;
    }
    return route.fulfill({
      status: 201,
      json: { username: body.email, principalType: 'CUSTOMER' },
    });
  });

  await page.route(/\/api\/auth\/customer\/login$/, (route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    if (
      (body.email ?? '').trim().toLowerCase() === email.toLowerCase() &&
      body.password === options.validPassword
    ) {
      signedIn = true;
      return route.fulfill({ json: { username: email, principalType: 'CUSTOMER' } });
    }
    return route.fulfill(problem(401, 'Unauthorized', 'INVALID_CREDENTIALS'));
  });

  await page.route(/\/api\/auth\/logout$/, (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });

  return {
    fetches: () => fetches,
    refuseNextRegisterWith: (code) => {
      refuseWith = code;
    },
    lastSolvedCounter: () => lastCounter,
  };
}

/**
 * Stateful mock of the OPERATOR self-registration → admin-approval → sign-in → create-venue lifecycle
 * for the CI-safe suite. One in-memory model backs the whole flow so a single Playwright page
 * can drive it end to end:
 *
 * - `POST /api/auth/operator/register` always answers a byte-identical `202 {status:'PENDING'}`
 *   (non-enumeration, D-8); only a fresh username adds a PENDING row (carrying its password + contact
 *   email). No session is established by the 202 itself — the FE follows up with a normal sign-in.
 * - `POST /api/auth/operator/login` accepts the fixed ADMIN account (→ `admin:true`), any PENDING
 *   registration's own password (#694), and any APPROVED operator's own password; everything else
 *   is the generic 401. `/api/auth/me` reflects the session incl. the `admin` flag and the
 *   `operatorStatus` the pending-approval notice keys on.
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
  interface AccountOp {
    id: number;
    username: string;
    contactEmail: string | null;
    password: string;
    admin: boolean;
    suspended: boolean;
  }
  const pending: PendingOp[] = [];
  /** Decided accounts (ACTIVE + SUSPENDED) — what `GET /api/admin/operators/accounts` returns. */
  const accounts: AccountOp[] = [];
  /** Login works for a PENDING registration or a decided, NOT-suspended account (#694). */
  const canSignIn = (username: string, password: string | undefined): boolean =>
    !!password &&
    (pending.some((p) => p.username === username && p.password === password) ||
      accounts.some((a) => a.username === username && !a.suspended && a.password === password));
  let nextOpId = 1;
  let nextVenueId = 100;
  let session: { username: string; admin: boolean } | undefined;

  // The admin is itself a decided account — its own row is where "This is you" shows.
  accounts.push({
    id: nextOpId++,
    username: admin.username,
    contactEmail: null,
    password: admin.password,
    admin: true,
    suspended: false,
  });

  const statusOf = (username: string): string =>
    pending.some((p) => p.username === username) ? 'PENDING' : 'ACTIVE';
  const principal = () =>
    session
      ? {
          username: session.username,
          principalType: 'OPERATOR',
          admin: session.admin,
          operatorStatus: statusOf(session.username),
        }
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
      !!username &&
      (accounts.some((a) => a.username === username) ||
        pending.some((p) => p.username === username));
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
    if (canSignIn(username, body.password)) {
      session = { username, admin: accounts.some((a) => a.username === username && a.admin) };
      return route.fulfill({ json: principal() });
    }
    // Generic 401 for wrong password / unknown / suspended alike (no enumeration, D-8).
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
    const op = pending[idx];
    if (approve) {
      // Approval makes it a decided account — now listed under /accounts; a live session survives.
      accounts.push({
        id: op.id,
        username: op.username,
        contactEmail: op.contactEmail,
        password: op.password,
        admin: false,
        suspended: false,
      });
    } else if (session.username === op.username) {
      session = undefined; // rejection REVOKES the target's live session, as the server does (#694)
    }
    pending.splice(idx, 1); // approved or rejected → leaves the pending queue
    return route.fulfill({ status: 204 });
  };
  await page.route(/\/api\/admin\/operators\/\d+\/approve$/, (route) => decide(route, true));
  await page.route(/\/api\/admin\/operators\/\d+\/reject$/, (route) => decide(route, false));

  await page.route(/\/api\/admin\/operators\/accounts$/, (route) =>
    session?.admin
      ? route.fulfill({
          json: [...accounts]
            .sort((a, b) => a.username.localeCompare(b.username))
            .map((a) => ({
              id: a.id,
              username: a.username,
              contactEmail: a.contactEmail,
              admin: a.admin,
              suspended: a.suspended,
            })),
        })
      : route.fulfill(problem(403, 'Forbidden', 'ACCESS_DENIED')),
  );

  /** Suspend/reinstate; suspending also REVOKES that operator's live session, as the server does. */
  const transition = (route: import('@playwright/test').Route, suspend: boolean) => {
    if (!session?.admin) {
      return route.fulfill(problem(403, 'Forbidden', 'ACCESS_DENIED'));
    }
    const id = Number(/\/operators\/(\d+)\/(?:suspend|reinstate)/.exec(route.request().url())?.[1]);
    const target = accounts.find((a) => a.id === id);
    if (!target) {
      return route.fulfill(problem(404, 'Not Found', 'NO_SUCH_OPERATOR'));
    }
    if (suspend && target.username === session.username) {
      return route.fulfill(problem(409, 'Conflict', 'CANNOT_SUSPEND_SELF'));
    }
    if (target.suspended === suspend) {
      return route.fulfill(problem(409, 'Conflict', 'WRONG_STATUS'));
    }
    target.suspended = suspend;
    if (suspend && session.username === target.username) {
      session = undefined;
    }
    return route.fulfill({ status: 204 });
  };
  await page.route(/\/api\/admin\/operators\/\d+\/suspend$/, (route) => transition(route, true));
  await page.route(/\/api\/admin\/operators\/\d+\/reinstate$/, (route) => transition(route, false));

  await page.route(/\/api\/venues$/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 201, json: { id: nextVenueId++ } })
      : route.fulfill({ json: [] }),
  );

  // Owning nothing forwards to onboarding — where this spec creates its first venue.
  await mockOwnedVenues(page, []);

  await page.route(/\/api\/auth\/logout$/, (route) => {
    session = undefined;
    return route.fulfill({ status: 204 });
  });
}

/**
 * Stateful mock of the CUSTOMER SSO flow for the CI-safe suite. The FE starts SSO with a
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
 * Stateful mock of the CUSTOMER account-recovery API for the CI-safe suite: forgot-password
 * always answers a neutral 204 (non-enumeration, D-8); reset-password + verify-email accept only
 * `validToken`, else the generic 400 `INVALID_OR_EXPIRED_TOKEN`. A successful reset rotates the mock's
 * accepted password AND signs the session out (the real reset invalidates sessions); a successful
 * verify flips `emailVerified`, which `/me` + login then reflect. Login succeeds for the CURRENT password
 * only — so the reset e2e can prove the old password stops working and the new one starts.
 *
 * <p>The same rotating credential backs the authenticated set/change-password endpoint, so one
 * mock covers every way a customer's password can change. An account with NO `initialPassword` is the
 * SSO-only case (no local credential): nothing signs in until a first password is set, and that first
 * set needs no current password. That endpoint's branch order mirrors the server — `RateLimitFilter`
 * spends the per-IP budget before the controller runs, and the controller validates the password policy
 * before it reads the stored credential — so a real reordering cannot leave this suite green.
 */
export async function mockCustomerRecoveryApi(
  page: Page,
  options: {
    readonly email: string;
    /** The stored credential; omit for an SSO-only account that has none yet. */
    readonly initialPassword?: string;
    /** The one token the reset/verify routes accept; omit in a spec that redeems no token. */
    readonly validToken?: string;
    /** Start with a live session — stands in for a completed SSO dance, which the SSO mock drives. */
    readonly signedIn?: boolean;
    /** Provider-verified email (SSO), before any verify-email token is redeemed. */
    readonly emailVerified?: boolean;
    /**
     * Attempts allowed on `POST /api/me/password` before the per-IP budget answers 429.
     * Defaults to the deployed capacity (`riviera.ratelimit.login.capacity`, 10 per minute); a spec
     * proving the FE's rate-limit rendering sets something small rather than clicking ten times.
     */
    readonly passwordChangeBudget?: number;
    /** Whether the do-not-email list withholds the verification resend. Defaults to deliverable. */
    readonly verificationMailWithheld?: boolean;
  },
): Promise<void> {
  const { email, validToken } = options;
  let password = options.initialPassword;
  let signedIn = options.signedIn ?? false;
  let emailVerified = options.emailVerified ?? false;
  let passwordChangeAttempts = 0;

  const principal = () => ({ username: email, principalType: 'CUSTOMER', emailVerified });

  await page.route(/\/api\/auth\/me$/, (route) =>
    signedIn
      ? route.fulfill({ json: principal() })
      : route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED')),
  );

  await page.route(/\/api\/auth\/customer\/login$/, (route) => {
    const body = route.request().postDataJSON() as { email?: string; password?: string };
    // `password === undefined` is the SSO-only account: no stored credential, so nothing signs in.
    if (
      password !== undefined &&
      (body.email ?? '').trim().toLowerCase() === email.toLowerCase() &&
      body.password === password
    ) {
      signedIn = true;
      return route.fulfill({ json: principal() });
    }
    return route.fulfill(problem(401, 'Unauthorized', 'INVALID_CREDENTIALS'));
  });

  // The signed-in set/change-password endpoint, rate-limited per IP — see the TSDoc above.
  await page.route(/\/api\/me\/password$/, (route) => {
    if (!signedIn) {
      return route.fulfill(problem(401, 'Unauthorized', 'UNAUTHENTICATED'));
    }
    if (++passwordChangeAttempts > (options.passwordChangeBudget ?? 10)) {
      return route.fulfill(problem(429, 'Too Many Requests', 'RATE_LIMITED'));
    }
    const body = route.request().postDataJSON() as {
      newPassword?: string;
      currentPassword?: string | null;
    };
    const newPassword = body.newPassword ?? '';
    const policyProblem = passwordPolicyProblem(newPassword, email.split('@')[0]);
    if (policyProblem) {
      return route.fulfill(policyProblem);
    }
    // Nested as the controller nests it: a stored password is what makes either answer reachable.
    if (password !== undefined) {
      if (!body.currentPassword) {
        return route.fulfill(problem(400, 'Bad Request', 'MISSING_CURRENT_PASSWORD'));
      }
      if (body.currentPassword !== password) {
        return route.fulfill(problem(400, 'Bad Request', 'INVALID_CURRENT_PASSWORD'));
      }
    }
    // The server revokes the customer's OTHER sessions only — the calling one deliberately survives.
    password = newPassword;
    return route.fulfill({ status: 204 });
  });

  await page.route(/\/api\/auth\/customer\/forgot-password$/, (route) =>
    route.fulfill({ status: 204 }),
  );

  await page.route(/\/api\/auth\/customer\/reset-password$/, (route) => {
    const body = route.request().postDataJSON() as { token?: string; newPassword?: string };
    if (validToken !== undefined && body.token === validToken && body.newPassword) {
      password = body.newPassword;
      signedIn = false; // a reset invalidates existing sessions
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(problem(400, 'Bad Request', 'INVALID_OR_EXPIRED_TOKEN'));
  });

  await page.route(/\/api\/auth\/customer\/verify-email$/, (route) => {
    const body = route.request().postDataJSON() as { token?: string };
    if (validToken !== undefined && body.token === validToken) {
      emailVerified = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(problem(400, 'Bad Request', 'INVALID_OR_EXPIRED_TOKEN'));
  });

  // Mirrors the real 200 {emailWithheld} shape exactly.
  await page.route(/\/api\/me\/verify-email\/request$/, (route) =>
    route.fulfill({ json: { emailWithheld: options.verificationMailWithheld ?? false } }),
  );

  await page.route(/\/api\/auth\/logout$/, (route) => {
    signedIn = false;
    return route.fulfill({ status: 204 });
  });
}

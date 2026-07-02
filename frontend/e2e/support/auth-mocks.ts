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

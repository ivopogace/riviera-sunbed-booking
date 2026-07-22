import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';

import { OperatorAuth } from './operator-auth';
import { operatorSessionGuard } from './operator-session.guard';

/** An {@link OperatorAuth} whose startup restore is settled by the test, not by an HTTP round-trip. */
class FakeOperatorAuth {
  private settleReady!: () => void;
  private readonly ready = new Promise<void>((resolve) => (this.settleReady = resolve));
  readonly signedIn = signal(false);

  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Finish the restore, landing on the given session state. */
  settle(signedIn: boolean): void {
    this.signedIn.set(signedIn);
    this.settleReady();
  }
}

/** Let every pending microtask AND macrotask run, so "still undecided" is unambiguous. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

describe('operatorSessionGuard', () => {
  let auth: FakeOperatorAuth;

  beforeEach(() => {
    auth = new FakeOperatorAuth();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: OperatorAuth, useValue: auth }],
    });
  });

  function run(url: string): Promise<boolean | UrlTree> {
    const state = { url } as RouterStateSnapshot;
    const route = {} as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(
      () => operatorSessionGuard(route, state) as Promise<boolean | UrlTree>,
    );
  }

  it('awaits restore before deciding', async () => {
    // R-1 / AC-8. A guard that read signedIn() eagerly would see `false` here and redirect a
    // signed-in operator to sign-in on every reload.
    let decision: boolean | UrlTree | undefined;
    const guard = run('/operator/12').then((d) => (decision = d));

    await flush();
    expect(decision).toBeUndefined();

    auth.settle(true);
    await guard;
    expect(decision).toBe(true);
  });

  it('lets a signed-in operator through untouched', async () => {
    auth.settle(true);
    expect(await run('/operator/12')).toBe(true);
  });

  it('redirects a signed-out visitor to the operator audience carrying the returnUrl', async () => {
    auth.settle(false);
    const decision = await run('/operator/12/payouts');

    expect(decision).toBeInstanceOf(UrlTree);
    const tree = decision as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe(
      '/account/sign-in?audience=operator&returnUrl=%2Foperator%2F12%2Fpayouts',
    );
  });

  it('redirects a customer session too — a tourist session grants no operator surface', async () => {
    // AC-9: OperatorAuth filters /me by principal type, so a CUSTOMER session leaves signedIn false.
    auth.settle(false);
    expect(await run('/operator')).toBeInstanceOf(UrlTree);
  });
});

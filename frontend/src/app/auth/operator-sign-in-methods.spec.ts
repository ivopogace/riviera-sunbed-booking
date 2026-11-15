import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import {
  OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE,
  OperatorAuth,
  OperatorLinkStartResult,
  OperatorSignInMethod,
  OperatorUnlinkResult,
} from '../core/operator-auth';
import { OperatorSignInMethods } from './operator-sign-in-methods';

function authStub(
  options: {
    methods?: readonly OperatorSignInMethod[];
    link?: OperatorLinkStartResult;
    unlink?: OperatorUnlinkResult;
  } = {},
) {
  return {
    signInMethods: vi.fn(() => Promise.resolve(options.methods ?? [])),
    startLink: vi.fn(() => Promise.resolve(options.link ?? 'started')),
    unlink: vi.fn(() => Promise.resolve(options.unlink ?? 'unlinked')),
    sessionLost: vi.fn(),
  };
}

async function render(
  auth: ReturnType<typeof authStub>,
  query: Record<string, string> = {},
): Promise<ComponentFixture<OperatorSignInMethods>> {
  await TestBed.configureTestingModule({
    imports: [OperatorSignInMethods],
    providers: [
      { provide: OperatorAuth, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: new BehaviorSubject(convertToParamMap(query)) },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(OperatorSignInMethods);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function el(fixture: ComponentFixture<OperatorSignInMethods>, testId: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
}

async function clickAndSettle(
  fixture: ComponentFixture<OperatorSignInMethods>,
  testId: string,
): Promise<void> {
  el(fixture, testId)!.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

function typePassword(fixture: ComponentFixture<OperatorSignInMethods>, value: string): void {
  const input = el(fixture, 'osm-current') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

describe('OperatorSignInMethods (#276)', () => {
  it('offers to unlink a linked provider and to link the others', async () => {
    const fixture = await render(
      authStub({ methods: [{ provider: 'google', linkedAt: '2026-06-15T10:00:00Z' }] }),
    );

    expect(el(fixture, 'osm-unlink-google')).not.toBeNull();
    expect(el(fixture, 'osm-link-google')).toBeNull();
    expect(el(fixture, 'osm-link-apple')).not.toBeNull();
  });

  it('asks for the current password before starting a link', async () => {
    const auth = authStub();
    const fixture = await render(auth);

    await clickAndSettle(fixture, 'osm-link-google');

    expect(auth.startLink).not.toHaveBeenCalled();
    expect(el(fixture, 'osm-error')?.textContent?.trim()).toBe(
      OPERATOR_CURRENT_PASSWORD_REQUIRED_MESSAGE,
    );
  });

  it('starts the link with the typed password, as typed', async () => {
    const auth = authStub();
    const fixture = await render(auth);
    typePassword(fixture, ' my pass ');

    await clickAndSettle(fixture, 'osm-link-apple');

    expect(auth.startLink).toHaveBeenCalledWith('apple', ' my pass ');
    expect(el(fixture, 'osm-error')).toBeNull();
  });

  it('names a wrong current password', async () => {
    const fixture = await render(authStub({ link: 'invalid-current' }));
    typePassword(fixture, 'wrong');

    await clickAndSettle(fixture, 'osm-link-google');

    expect(el(fixture, 'osm-error')?.textContent).toContain('incorrect');
  });

  it('unlinks, says other devices were signed out, and re-reads the list', async () => {
    const auth = authStub({ methods: [{ provider: 'apple', linkedAt: '2026-06-15T10:00:00Z' }] });
    const fixture = await render(auth);

    await clickAndSettle(fixture, 'osm-unlink-apple');

    expect(auth.unlink).toHaveBeenCalledWith('apple');
    expect(auth.signInMethods).toHaveBeenCalledTimes(2);
    expect(el(fixture, 'osm-notice')?.textContent).toContain('signed out');
  });

  it('keeps the last credential and says why', async () => {
    const fixture = await render(
      authStub({
        methods: [{ provider: 'apple', linkedAt: '2026-06-15T10:00:00Z' }],
        unlink: 'last-credential',
      }),
    );

    await clickAndSettle(fixture, 'osm-unlink-apple');

    expect(el(fixture, 'osm-error')?.textContent).toContain('only way left');
  });

  it('ends the session locally when the unlink finds it gone', async () => {
    const auth = authStub({
      methods: [{ provider: 'apple', linkedAt: '2026-06-15T10:00:00Z' }],
      unlink: 'session-lost',
    });
    const fixture = await render(auth);

    await clickAndSettle(fixture, 'osm-unlink-apple');

    expect(auth.sessionLost).toHaveBeenCalled();
  });

  it.each([
    ['linked', 'Linked.'],
    ['link-failed', "couldn't be linked"],
  ])('reports the round trip that returned with ?sso=%s', async (sso, text) => {
    const fixture = await render(authStub(), { sso });

    expect(el(fixture, 'osm-notice')?.textContent).toContain(text);
  });
});

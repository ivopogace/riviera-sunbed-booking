import { HttpErrorResponse } from '@angular/common/http';
import { clearTranslations, loadTranslations, ɵcomputeMsgId } from '@angular/localize';

import { customerRegisterMessage, customerSignInMessage } from './customer-auth';
import {
  operatorPasswordChangeMessage,
  operatorRegisterMessage,
  signInFailureMessage,
} from './operator-auth';
import { signInResultFor } from './session-auth';

/**
 * The server's English `detail` never reaches a guest: an auth failure renders SPA copy keyed on the
 * problem `code` (or status), translated like any other message, and a code the SPA does not know
 * falls back to the translated generic message. Runtime `$localize` here stands in for the
 * per-locale build, which inlines the same targets.
 */
const SQ: Readonly<Record<string, string>> = {
  'Something went wrong signing in. Please try again.':
    'Diçka shkoi keq gjatë hyrjes. Ju lutemi provoni përsëri.',
  'Something went wrong creating your account. Please try again.':
    'Diçka shkoi keq gjatë krijimit të llogarisë suaj. Ju lutemi provoni përsëri.',
  'Something went wrong changing your password. Please try again.':
    'Diçka shkoi keq gjatë ndryshimit të fjalëkalimit. Ju lutemi provoni përsëri.',
  'Something went wrong submitting your registration. Please try again.':
    'Diçka shkoi keq gjatë dërgimit të regjistrimit. Ju lutemi provoni përsëri.',
};

/** A 500 from an endpoint that answers a code the SPA has never seen, with English server text. */
const UNKNOWN_PROBLEM = new HttpErrorResponse({
  status: 500,
  error: { code: 'SOME_FUTURE_CODE', detail: 'An English server sentence.' },
});

describe('auth error copy', () => {
  beforeEach(() =>
    loadTranslations(
      Object.fromEntries(
        Object.entries(SQ).map(([source, target]) => [ɵcomputeMsgId(source), target]),
      ),
    ),
  );
  afterEach(() => clearTranslations());

  it('renders an unknown code on customer sign-in as the translated fallback, never the detail', () => {
    const message = customerSignInMessage(signInResultFor(UNKNOWN_PROBLEM));
    expect(message).toBe(SQ['Something went wrong signing in. Please try again.']);
    expect(message).not.toContain('English server sentence');
  });

  it('renders an unknown code on operator sign-in as the translated fallback', () => {
    expect(signInFailureMessage(signInResultFor(UNKNOWN_PROBLEM))).toBe(
      SQ['Something went wrong signing in. Please try again.'],
    );
  });

  it('translates the unmapped-failure fallback of every auth mapper', () => {
    expect(customerRegisterMessage('error')).toBe(
      SQ['Something went wrong creating your account. Please try again.'],
    );
    expect(operatorPasswordChangeMessage('error')).toBe(
      SQ['Something went wrong changing your password. Please try again.'],
    );
    expect(operatorRegisterMessage('error')).toBe(
      SQ['Something went wrong submitting your registration. Please try again.'],
    );
  });
});

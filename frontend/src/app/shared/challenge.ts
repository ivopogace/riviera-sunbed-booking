import { environment } from '../../environments/environment';

/**
 * The proof-of-work challenge's wire vocabulary (ADR-0016): where the widget fetches a challenge,
 * the header a fenced write carries the solution in, and the three problem `code`s the edge answers
 * when the solution is missing, wrong, or stale. Pure — no HTTP, no app state — so the core auth
 * services, the widget wrapper and the pages share one spelling.
 */

/** The public challenge endpoint; `204` from it means the fence is switched off. */
export const CHALLENGE_URL = `${environment.apiBaseUrl}/api/auth/challenge`;

/** The request header the widget's base64 payload travels in. */
export const CHALLENGE_HEADER = 'X-Altcha-Payload';

export const CHALLENGE_REQUIRED_CODE = 'CHALLENGE_REQUIRED';
export const CHALLENGE_INVALID_CODE = 'CHALLENGE_INVALID';
export const CHALLENGE_EXPIRED_CODE = 'CHALLENGE_EXPIRED';

/** A fenced write refused for its challenge — each needs a fresh solve before a retry can succeed. */
export type ChallengeRejection = 'challenge-required' | 'challenge-invalid' | 'challenge-expired';

const REJECTIONS: Readonly<Record<string, ChallengeRejection>> = {
  [CHALLENGE_REQUIRED_CODE]: 'challenge-required',
  [CHALLENGE_INVALID_CODE]: 'challenge-invalid',
  [CHALLENGE_EXPIRED_CODE]: 'challenge-expired',
};

/** The rejection a problem `code` names, or undefined when the code is not a challenge code. */
export function challengeRejection(code: string | undefined): ChallengeRejection | undefined {
  return code === undefined ? undefined : REJECTIONS[code];
}

export function isChallengeRejection(result: unknown): result is ChallengeRejection {
  return (
    typeof result === 'string' && Object.values(REJECTIONS).includes(result as ChallengeRejection)
  );
}

/** The headers a fenced write sends: the payload when the widget produced one, nothing otherwise. */
export function challengeHeaders(payload: string | undefined): Record<string, string> {
  return payload ? { [CHALLENGE_HEADER]: payload } : {};
}

export const CHALLENGE_REQUIRED_MESSAGE =
  'The security check hasn’t finished yet. Give it a moment and try again.';
export const CHALLENGE_INVALID_MESSAGE =
  'The security check didn’t verify, so it has been restarted. Please try again.';
export const CHALLENGE_EXPIRED_MESSAGE =
  'The security check expired, so it has been restarted. Please try again.';

/** The one wording per rejection, so no page phrases the same server answer differently. */
export function challengeRejectionMessage(rejection: ChallengeRejection): string {
  switch (rejection) {
    case 'challenge-required':
      return CHALLENGE_REQUIRED_MESSAGE;
    case 'challenge-invalid':
      return CHALLENGE_INVALID_MESSAGE;
    case 'challenge-expired':
      return CHALLENGE_EXPIRED_MESSAGE;
  }
}

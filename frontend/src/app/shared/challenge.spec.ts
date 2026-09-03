import {
  CHALLENGE_EXPIRED_MESSAGE,
  CHALLENGE_HEADER,
  CHALLENGE_INVALID_MESSAGE,
  CHALLENGE_REQUIRED_MESSAGE,
  challengeHeaders,
  challengeRejection,
  challengeRejectionMessage,
  isChallengeRejection,
} from './challenge';

describe('challenge vocabulary', () => {
  it('maps the three edge codes and nothing else', () => {
    expect(challengeRejection('CHALLENGE_REQUIRED')).toBe('challenge-required');
    expect(challengeRejection('CHALLENGE_INVALID')).toBe('challenge-invalid');
    expect(challengeRejection('CHALLENGE_EXPIRED')).toBe('challenge-expired');
    expect(challengeRejection('INVALID_REQUEST')).toBeUndefined();
    expect(challengeRejection(undefined)).toBeUndefined();
  });

  it('recognises a rejection among the register results', () => {
    expect(isChallengeRejection('challenge-expired')).toBe(true);
    expect(isChallengeRejection('registered')).toBe(false);
    expect(isChallengeRejection(undefined)).toBe(false);
  });

  it('sends the header only when a payload exists', () => {
    expect(challengeHeaders('abc')).toEqual({ [CHALLENGE_HEADER]: 'abc' });
    expect(challengeHeaders(undefined)).toEqual({});
    expect(challengeHeaders('')).toEqual({});
  });

  it('words each rejection once', () => {
    expect(challengeRejectionMessage('challenge-required')).toBe(CHALLENGE_REQUIRED_MESSAGE);
    expect(challengeRejectionMessage('challenge-invalid')).toBe(CHALLENGE_INVALID_MESSAGE);
    expect(challengeRejectionMessage('challenge-expired')).toBe(CHALLENGE_EXPIRED_MESSAGE);
  });
});

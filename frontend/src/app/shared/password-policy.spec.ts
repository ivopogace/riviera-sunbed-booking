import { describe, expect, it } from 'vitest';

import {
  emailLocalPart,
  PASSWORD_BLOCKED_MESSAGE,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  PASSWORD_TOO_LONG_MESSAGE,
  passwordPolicyMessage,
  passwordPolicyViolation,
} from './password-policy';

describe('passwordPolicyViolation', () => {
  it('rejects eleven characters and accepts twelve, counting surrounding spaces', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(passwordPolicyViolation('elevenchars')).toBe('too-short');
    expect(passwordPolicyViolation('twelve-chars')).toBeUndefined();
    expect(passwordPolicyViolation(' ten-chs  ')).toBe('too-short');
    expect(passwordPolicyViolation('  ten-chs   ')).toBeUndefined();
  });

  it('caps at 72 UTF-8 bytes, not characters', () => {
    expect(passwordPolicyViolation('ë'.repeat(36))).toBeUndefined();
    expect(passwordPolicyViolation('ë'.repeat(36) + 'a')).toBe('too-long');
    expect(passwordPolicyViolation('a'.repeat(73))).toBe('too-long');
  });

  it('blocks the service name in any case, with or without an account name', () => {
    expect(passwordPolicyViolation('MyRIVIERAsummer2026')).toBe('blocked');
    expect(passwordPolicyViolation('MyRIVIERAsummer2026', 'ana')).toBe('blocked');
  });

  it('blocks the account name in any case and skips one under three characters', () => {
    expect(passwordPolicyViolation('Ana.Kola-2026!!', 'ana.kola')).toBe('blocked');
    expect(passwordPolicyViolation('xxANA.KOLAxx-2026', 'Ana.Kola')).toBe('blocked');
    expect(passwordPolicyViolation('correct-horse-battery', 'ana.kola')).toBeUndefined();
    expect(passwordPolicyViolation('axle-and-wheel-1', 'ax')).toBeUndefined();
    expect(passwordPolicyViolation('axle-and-wheel-1', 'axl')).toBe('blocked');
  });

  it('checks length before the blocklist, as the server does', () => {
    expect(passwordPolicyViolation('riviera', 'riv')).toBe('too-short');
  });
});

describe('the shared copy', () => {
  it('names the rule up front and one message per failed rule', () => {
    expect(PASSWORD_POLICY_HINT).toContain('At least 12 characters');
    expect(passwordPolicyMessage('too-short')).toBe(PASSWORD_LENGTH_MESSAGE);
    expect(passwordPolicyMessage('too-long')).toBe(PASSWORD_TOO_LONG_MESSAGE);
    expect(passwordPolicyMessage('blocked')).toBe(PASSWORD_BLOCKED_MESSAGE);
    expect(PASSWORD_LENGTH_MESSAGE).toContain('12–72 characters');
    expect(PASSWORD_BLOCKED_MESSAGE).toContain('name you sign in with');
  });

  it('takes the email local part, lower-cased, as the name a tourist signs in with', () => {
    expect(emailLocalPart('Ana.Kola@Example.com')).toBe('ana.kola');
    expect(emailLocalPart('no-at-sign')).toBe('no-at-sign');
  });
});

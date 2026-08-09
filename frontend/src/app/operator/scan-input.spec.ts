import { describe, expect, it } from 'vitest';

import { codeFromScan } from './scan-input';

describe('codeFromScan', () => {
  it('extracts the code from a booking-view URL (what the tourist QR encodes)', () => {
    expect(codeFromScan('https://riviera-sunbed-booking.onrender.com/booking/ABCD123456')).toBe(
      'ABCD123456',
    );
  });

  it('accepts a bare code, normalized like Find-a-booking (trim, uppercase, strip space/dash)', () => {
    expect(codeFromScan('  abcd-1234 56 ')).toBe('ABCD123456');
  });

  it('accepts a booking URL with trailing query or hash noise', () => {
    expect(codeFromScan('http://localhost:4200/booking/wxyz987654?utm=x#top')).toBe('WXYZ987654');
  });

  it('rejects QR payloads that are clearly not a booking code or booking link', () => {
    expect(codeFromScan('https://example.com/somewhere-else')).toBeNull();
    expect(codeFromScan('hello world: not a code!')).toBeNull();
    expect(codeFromScan('   ')).toBeNull();
  });
});

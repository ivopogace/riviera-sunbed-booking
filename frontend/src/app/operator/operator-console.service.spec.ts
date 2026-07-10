import { HttpErrorResponse } from '@angular/common/http';

import { markErrorOf, releaseErrorOf } from './operator-console.service';

/**
 * The Daily-view walk-in mark/release error mappers (O5 #175). They narrow an HTTP failure's RFC-7807
 * `code` (issue #97) — or a 401 / non-HTTP failure — to the displayable union each surface maps to
 * operator copy. Pure functions; exhaustively covered here.
 */
describe('operator-console mark/release error mappers (#175)', () => {
  function problem(status: number, code?: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: code ? { code } : null });
  }

  describe('markErrorOf', () => {
    it('maps 401 to UNAUTHORIZED before reading the body', () => {
      expect(markErrorOf(problem(401, 'ANYTHING'))).toBe('UNAUTHORIZED');
    });

    it('passes through the known problem codes', () => {
      for (const code of [
        'ALREADY_TAKEN',
        'DATE_IN_PAST',
        'NO_SUCH_SET',
        'NO_SUCH_VENUE',
        'NOT_VENUE_OWNER',
        'INVALID_REQUEST',
      ]) {
        expect(markErrorOf(problem(409, code))).toBe(code);
      }
    });

    it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
      expect(markErrorOf(problem(500, 'SOMETHING_ELSE'))).toBe('UNKNOWN');
      expect(markErrorOf(problem(500))).toBe('UNKNOWN');
      expect(markErrorOf(new Error('boom'))).toBe('UNKNOWN');
    });
  });

  describe('releaseErrorOf', () => {
    it('maps 401 to UNAUTHORIZED', () => {
      expect(releaseErrorOf(problem(401))).toBe('UNAUTHORIZED');
    });

    it('passes through NOT_MARKED and NOT_VENUE_OWNER', () => {
      expect(releaseErrorOf(problem(409, 'NOT_MARKED'))).toBe('NOT_MARKED');
      expect(releaseErrorOf(problem(403, 'NOT_VENUE_OWNER'))).toBe('NOT_VENUE_OWNER');
    });

    it('maps an unknown code and a non-HTTP failure to UNKNOWN', () => {
      expect(releaseErrorOf(problem(409, 'WHATEVER'))).toBe('UNKNOWN');
      expect(releaseErrorOf('not an http error')).toBe('UNKNOWN');
    });
  });
});

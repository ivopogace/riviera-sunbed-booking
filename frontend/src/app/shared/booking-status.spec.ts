import { STATUS_META, humanizeStatus, metaFor } from './booking-status';

describe('booking-status presentation metadata (shared chip source)', () => {
  it.each<[string, string, string, 'Paid' | 'Amount']>([
    ['CONFIRMED', 'Confirmed', 'chip--confirmed', 'Paid'],
    ['PENDING_REQUEST', 'Pending request', 'chip--pending', 'Amount'],
    ['AWAITING_PAYMENT', 'Awaiting payment', 'chip--awaiting', 'Amount'],
    ['DECLINED', 'Declined', 'chip--declined', 'Amount'],
    ['EXPIRED', 'Expired', 'chip--expired', 'Amount'],
    ['CANCELLED', 'Cancelled', 'chip--cancelled', 'Paid'],
    ['COMPLETED', 'Completed', 'chip--completed', 'Paid'],
    ['NO_SHOW', 'No-show', 'chip--no-show', 'Paid'],
    ['WITHDRAWN', 'Withdrawn', 'chip--withdrawn', 'Amount'],
  ])('maps %s to the design label/chip/amount', (status, label, chip, amount) => {
    expect(metaFor(status)).toEqual({ label, chip, amount });
  });

  it('covers exactly the 9 lifecycle statuses (exhaustive — a 10th is one row here)', () => {
    expect(Object.keys(STATUS_META).sort()).toEqual([
      'AWAITING_PAYMENT',
      'CANCELLED',
      'COMPLETED',
      'CONFIRMED',
      'DECLINED',
      'EXPIRED',
      'NO_SHOW',
      'PENDING_REQUEST',
      'WITHDRAWN',
    ]);
  });

  // ADR-0026 §7 (#1381): every day refunded reads as refunded, not as a held set or a missed stay.
  it.each(['CONFIRMED', 'NO_SHOW'])(
    'reads a %s booking with nothing left as Refunded',
    (status) => {
      expect(metaFor(status, true)).toEqual({
        label: 'Refunded',
        chip: 'chip--cancelled',
        amount: 'Paid',
      });
    },
  );

  it.each(['CANCELLED', 'COMPLETED', 'AWAITING_PAYMENT'])(
    'keeps the %s chip even when nothing is left',
    (status) => {
      expect(metaFor(status, true)).toEqual(metaFor(status));
    },
  );

  it('falls back gracefully for a status this build does not know (FE/BE skew)', () => {
    expect(metaFor('ON_HOLD')).toEqual({
      label: 'On hold',
      chip: 'chip--expired',
      amount: 'Amount',
    });
  });

  it('humanizes a raw status token', () => {
    expect(humanizeStatus('NO_SHOW')).toBe('No show');
  });
});

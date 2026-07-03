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
  ])('maps %s to the design label/chip/amount', (status, label, chip, amount) => {
    expect(metaFor(status)).toEqual({ label, chip, amount });
  });

  it('covers exactly the 8 #98 statuses (exhaustive — a 9th status is one row here)', () => {
    expect(Object.keys(STATUS_META).sort()).toEqual([
      'AWAITING_PAYMENT',
      'CANCELLED',
      'COMPLETED',
      'CONFIRMED',
      'DECLINED',
      'EXPIRED',
      'NO_SHOW',
      'PENDING_REQUEST',
    ]);
  });

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

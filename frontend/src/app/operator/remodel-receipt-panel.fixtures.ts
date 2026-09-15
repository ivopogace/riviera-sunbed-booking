import { RemodelReceipt } from './operator-console.model';

/** The receipt of a commit that moved two bookings — the shape the editor shows after Save and move. */
export const RECEIPT: RemodelReceipt = {
  receiptId: 41,
  committedAt: '2026-09-09T13:00:00Z',
  moves: [
    {
      bookingId: 7,
      bookingDate: '2026-09-20',
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      to: { setId: 5, rowLabel: 'A', positionNo: 7 },
      rowsAway: 0,
      positionsAway: 4,
    },
    {
      bookingId: 8,
      bookingDate: '2026-09-21',
      from: { setId: 2, rowLabel: 'A', positionNo: 2 },
      to: { setId: 11, rowLabel: 'B', positionNo: 1 },
      rowsAway: 1,
      positionsAway: 1,
    },
  ],
  refunds: [],
  releases: [],
  refundReason: '',
  refundedTotal: null,
  feeTotal: null,
};

/** The receipt of a commit that also ended claims it could not move — refund, release, decline. */
export const RECEIPT_WITH_ENDINGS: RemodelReceipt = {
  ...RECEIPT,
  receiptId: 42,
  refunds: [
    {
      bookingId: 9,
      bookingDate: '2026-09-22',
      from: { setId: 3, rowLabel: 'A', positionNo: 1 },
      amount: { minorUnits: 4500, currency: 'EUR' },
      fee: { minorUnits: 500, currency: 'EUR' },
    },
  ],
  releases: [
    {
      bookingId: 10,
      bookingDate: '2026-09-23',
      from: { setId: 3, rowLabel: 'A', positionNo: 1 },
      amount: { minorUnits: 2000, currency: 'EUR' },
      kind: 'RELEASE',
    },
    {
      bookingId: 11,
      bookingDate: '2026-09-24',
      from: { setId: 3, rowLabel: 'A', positionNo: 1 },
      amount: { minorUnits: 2000, currency: 'EUR' },
      kind: 'DECLINE',
    },
  ],
  refundReason: 'Re-laying row A for the season',
  refundedTotal: { minorUnits: 4500, currency: 'EUR' },
  feeTotal: { minorUnits: 500, currency: 'EUR' },
};

import { RemodelPreview } from './operator-console.model';

/** A preview with every group populated — the shape the layout editor confirms against. */
export const FULL_PREVIEW: RemodelPreview = {
  moves: [
    {
      bookingId: 7,
      bookingDate: '2026-09-20',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      to: { setId: 5, rowLabel: 'A', positionNo: 7 },
      rowsAway: 0,
      positionsAway: 4,
    },
    {
      bookingId: 8,
      bookingDate: '2026-09-20',
      amount: { minorUnits: 3500, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'A', positionNo: 2 },
      to: { setId: 11, rowLabel: 'B', positionNo: 1 },
      rowsAway: 1,
      positionsAway: 1,
    },
  ],
  refunds: [
    {
      bookingId: 9,
      bookingDate: '2026-09-22',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      fee: { minorUnits: 500, currency: 'EUR' },
    },
  ],
  releases: [
    {
      bookingId: 10,
      bookingDate: '2026-09-22',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'A', positionNo: 2 },
      kind: 'RELEASE',
    },
    {
      bookingId: 11,
      bookingDate: '2026-09-23',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      kind: 'DECLINE',
    },
  ],
  staffHolds: [{ set: { setId: 2, rowLabel: 'A', positionNo: 2 }, dates: ['2026-09-15'] }],
  blocks: [
    {
      bookingId: 12,
      bookingDate: '2026-09-11',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      reason: 'FROZEN',
    },
    {
      bookingId: 13,
      bookingDate: '2026-09-13',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'A', positionNo: 2 },
      reason: 'NO_MOVE_CANDIDATE',
    },
  ],
  keep: [
    { setId: 1, rowLabel: 'A', positionNo: 3 },
    { setId: 2, rowLabel: 'A', positionNo: 2 },
  ],
  previewToken: 'v1.full',
  feeTotal: { minorUnits: 500, currency: 'EUR' },
};

/** A preview that only moves — committable, and the one shape that needs no typed confirmation. */
export const MOVES_ONLY_PREVIEW: RemodelPreview = {
  ...FULL_PREVIEW,
  refunds: [],
  releases: [],
  staffHolds: [],
  blocks: [],
  keep: [],
  previewToken: 'v1.moves',
};

/** A picture the commit applies whose only claims are blocked — their sets stay on the map, nothing else changes for a guest. */
export const BLOCKS_ONLY_PREVIEW: RemodelPreview = {
  ...FULL_PREVIEW,
  moves: [],
  refunds: [],
  releases: [],
  staffHolds: [],
  previewToken: 'v1.blocks',
  feeTotal: { minorUnits: 0, currency: 'EUR' },
};

/** A picture the commit applies with staff holds alone in the way — the one shape that still offers Back only. */
export const HELD_PREVIEW: RemodelPreview = {
  ...FULL_PREVIEW,
  blocks: [],
  keep: [{ setId: 2, rowLabel: 'A', positionNo: 2 }],
  previewToken: 'v1.held',
};

/** A picture the commit applies that also refunds a guest — so it needs the typed confirmation. */
export const REFUNDING_PREVIEW: RemodelPreview = {
  ...FULL_PREVIEW,
  staffHolds: [],
  blocks: [],
  keep: [],
  previewToken: 'v1.refunds',
};

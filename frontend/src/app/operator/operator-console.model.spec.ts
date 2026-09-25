import {
  remodelPreviewIsCommittable,
  toProfileUpdate,
  VenueProfileView,
} from './operator-console.model';
import { BLOCKS_ONLY_PREVIEW, HELD_PREVIEW } from './remodel-preview-panel.fixtures';

const PINNED: VenueProfileView = {
  name: 'Miramar',
  beach: 'DHERMI',
  description: 'Sunbeds on the pebbles',
  bookingMode: 'INSTANT',
  bookingCutoff: '18:00',
  salesClose: '16:00',
  commissionBps: 1500,
  payoutCurrency: 'EUR',
  amenities: ['WIFI'],
  distanceToWaterM: 20,
  version: 7,
  photos: { cover: { previewUrl: null }, sunbeds: { previewUrl: null }, bar: { previewUrl: null } },
  location: { latitude: 40.1468, longitude: 19.6482 },
};

describe('toProfileUpdate', () => {
  it('carries the venue location through the full-replace body', () => {
    // A field missing here is written as null by "close online sales now"'s read-modify-write.
    expect(toProfileUpdate(PINNED).location).toEqual({ latitude: 40.1468, longitude: 19.6482 });
  });

  it('carries no location for an unpinned venue', () => {
    expect(toProfileUpdate({ ...PINNED, location: null }).location).toBeNull();
  });

  it('echoes the loaded version as the write token and omits the read-only fields', () => {
    const body = toProfileUpdate(PINNED);
    expect(body.expectedVersion).toBe(7);
    expect('commissionBps' in body).toBe(false);
    expect('payoutCurrency' in body).toBe(false);
  });
});

describe('remodelPreviewIsCommittable (#1199)', () => {
  it('a blocked claim no longer pins the whole save: its set is kept and the rest commits', () => {
    expect(remodelPreviewIsCommittable(BLOCKS_ONLY_PREVIEW)).toBe(true);
  });

  it('a staff walk-in hold still refuses the save as painted', () => {
    expect(remodelPreviewIsCommittable(HELD_PREVIEW)).toBe(false);
  });
});

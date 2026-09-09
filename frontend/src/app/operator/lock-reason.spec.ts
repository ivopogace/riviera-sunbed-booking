import { lockDescription, lockReason } from './lock-reason';

describe('lockReason', () => {
  it('names the booking when a guest is still coming, whatever the hold says', () => {
    expect(lockReason({ setId: 3, bookedOn: '2026-09-12', heldOn: '2026-09-12' })).toBe(
      'booked Sat 12 Sept 2026',
    );
    expect(lockReason({ setId: 3, bookedOn: '2026-09-12', heldOn: '2026-09-10' })).toBe(
      'booked Sat 12 Sept 2026',
    );
  });

  it('reads a hold with no live booking as a staff walk-in mark', () => {
    expect(lockReason({ setId: 3, bookedOn: null, heldOn: '2026-09-15' })).toBe(
      'held by staff Tue 15 Sept 2026',
    );
  });

  it('falls back to a bare "held" on a lock that names no date — the server never sends one', () => {
    expect(lockReason({ setId: 3, bookedOn: null, heldOn: null })).toBe('held');
  });

  it('describes the lock as move-or-remove only, never as unpaintable', () => {
    expect(lockDescription({ setId: 3, bookedOn: '2026-09-12', heldOn: null })).toBe(
      'Locked — booked Sat 12 Sept 2026. Can’t be moved or removed; tier and pool can still change.',
    );
  });
});

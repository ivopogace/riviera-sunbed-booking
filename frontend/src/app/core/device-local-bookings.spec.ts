import { installFakeStorage, removeFakeStorage } from '../../testing/fake-storage';
import { DeviceLocalBookings } from './device-local-bookings';

const KEY = 'riviera.bookings.v1';

describe('DeviceLocalBookings', () => {
  let store: Map<string, string>;

  beforeEach(() => (store = installFakeStorage()));
  afterEach(() => removeFakeStorage());

  it('remembers a code and exposes it', () => {
    const s = new DeviceLocalBookings();
    s.remember('RIVABCD23');
    expect(s.codes()).toEqual(['RIVABCD23']);
  });

  it('dedupes a repeated code, moving it to the front (newest first)', () => {
    const s = new DeviceLocalBookings();
    s.remember('AAAA1111');
    s.remember('BBBB2222');
    s.remember('AAAA1111');
    expect(s.codes()).toEqual(['AAAA1111', 'BBBB2222']);
  });

  it('persists across a fresh service instance (survives a reload)', () => {
    new DeviceLocalBookings().remember('CCCC3333');
    // A second instance re-reads localStorage on construction, as a new page load would.
    expect(new DeviceLocalBookings().codes()).toEqual(['CCCC3333']);
  });

  it('forgets a code and persists the removal', () => {
    const s = new DeviceLocalBookings();
    s.remember('DDDD4444');
    s.remember('EEEE5555');
    s.forget('DDDD4444');
    expect(s.codes()).toEqual(['EEEE5555']);
    expect(new DeviceLocalBookings().codes()).toEqual(['EEEE5555']);
  });

  it('ignores an empty code', () => {
    const s = new DeviceLocalBookings();
    s.remember('');
    expect(s.codes()).toEqual([]);
  });

  it('tolerates malformed JSON in storage (returns empty, never throws)', () => {
    store.set(KEY, '{not json');
    expect(() => new DeviceLocalBookings().codes()).not.toThrow();
    expect(new DeviceLocalBookings().codes()).toEqual([]);
  });

  it('tolerates a non-array payload and filters non-string entries', () => {
    store.set(KEY, JSON.stringify({ nope: true }));
    expect(new DeviceLocalBookings().codes()).toEqual([]);

    store.set(KEY, JSON.stringify(['ok', 123, null, 'fine']));
    expect(new DeviceLocalBookings().codes()).toEqual(['ok', 'fine']);
  });
});

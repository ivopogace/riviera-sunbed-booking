import { PendingRequestsStore } from './pending-requests-store';

/**
 * The badge-sync store: one writable count the shell reads and the Requests tab writes,
 * so the tab badge stays in sync with the queue after every action. Depless — constructed directly.
 */
describe('PendingRequestsStore', () => {
  it('starts at 0, then reflects the last authoritative set value', () => {
    const store = new PendingRequestsStore();
    expect(store.count()).toBe(0);

    store.set(3);
    expect(store.count()).toBe(3);

    store.set(2);
    expect(store.count()).toBe(2);
  });

  it('seeds the count only until the tab takes authority (a late seed cannot clobber a set)', () => {
    const store = new PendingRequestsStore();
    // Shell seeds before the tab is active.
    store.seed(5);
    expect(store.count()).toBe(5);
    // Tab takes authority (e.g. decremented after an accept).
    store.set(4);
    expect(store.count()).toBe(4);
    // A late-arriving shell seed must be ignored now.
    store.seed(5);
    expect(store.count()).toBe(4);
  });

  it('resets count and authority (console remount / sign-out), so a seed applies again afterwards', () => {
    const store = new PendingRequestsStore();
    store.set(5);
    store.reset();
    expect(store.count()).toBe(0);
    // After reset the store no longer considers the tab authoritative — a fresh seed applies.
    store.seed(2);
    expect(store.count()).toBe(2);
  });
});

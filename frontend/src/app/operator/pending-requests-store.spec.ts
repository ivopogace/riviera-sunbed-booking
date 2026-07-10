import { PendingRequestsStore } from './pending-requests-store';

/**
 * The badge-sync store (issue #176): one writable count the shell reads and the Requests tab writes,
 * so the tab badge stays in sync with the queue after every action. Depless — constructed directly.
 */
describe('PendingRequestsStore', () => {
  it('starts at 0, then reflects the last set value', () => {
    const store = new PendingRequestsStore();
    expect(store.count()).toBe(0);

    store.set(3);
    expect(store.count()).toBe(3);

    store.set(2);
    expect(store.count()).toBe(2);
  });

  it('resets back to 0 (sign-out)', () => {
    const store = new PendingRequestsStore();
    store.set(5);
    store.reset();
    expect(store.count()).toBe(0);
  });
});

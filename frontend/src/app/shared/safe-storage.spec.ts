import { installFakeStorage, removeFakeStorage } from '../../testing/fake-storage';
import { readJson, readStorage, writeJson, writeStorage } from './safe-storage';

const KEY = 'safe-storage.spec';

/** Install a localStorage whose every access throws, mimicking private-mode / quota lock-out. */
function installThrowingStorage(): void {
  const throwing = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: throwing,
    setItem: throwing,
    removeItem: throwing,
    clear: throwing,
  };
}

describe('safe-storage (guarded localStorage, issue #163)', () => {
  afterEach(() => removeFakeStorage());

  describe('with a working store', () => {
    let store: Map<string, string>;
    beforeEach(() => (store = installFakeStorage()));

    it('round-trips a raw string', () => {
      writeStorage(KEY, 'value');
      expect(readStorage(KEY)).toBe('value');
      expect(store.get(KEY)).toBe('value');
    });

    it('reads null for a key that was never written', () => {
      expect(readStorage(KEY)).toBeNull();
    });

    it('round-trips JSON', () => {
      writeJson(KEY, ['a', 'b']);
      expect(readJson(KEY)).toEqual(['a', 'b']);
    });

    it('reads null for a key that was never written (JSON)', () => {
      expect(readJson(KEY)).toBeNull();
    });

    it('reads null for malformed JSON rather than throwing', () => {
      store.set(KEY, '{not json');
      expect(() => readJson(KEY)).not.toThrow();
      expect(readJson(KEY)).toBeNull();
    });

    it('drops a non-serialisable value without throwing', () => {
      const cyclic: Record<string, unknown> = {};
      cyclic['self'] = cyclic;
      expect(() => writeJson(KEY, cyclic)).not.toThrow();
      expect(store.has(KEY)).toBe(false);
    });
  });

  describe('with no localStorage global (SSR / jsdom default)', () => {
    beforeEach(() => removeFakeStorage());

    it('reads degrade to null and writes are silent no-ops', () => {
      expect(readStorage(KEY)).toBeNull();
      expect(readJson(KEY)).toBeNull();
      expect(() => writeStorage(KEY, 'x')).not.toThrow();
      expect(() => writeJson(KEY, { a: 1 })).not.toThrow();
    });
  });

  describe('with a blocked store (private mode / quota)', () => {
    beforeEach(() => installThrowingStorage());

    it('swallows the access error on every operation', () => {
      expect(readStorage(KEY)).toBeNull();
      expect(readJson(KEY)).toBeNull();
      expect(() => writeStorage(KEY, 'x')).not.toThrow();
      expect(() => writeJson(KEY, { a: 1 })).not.toThrow();
    });
  });
});

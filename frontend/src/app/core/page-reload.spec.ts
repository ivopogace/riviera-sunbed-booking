import { WindowPageReload } from './page-reload';

interface FakeWindow {
  location: { href: string; assign: (url: string) => void; reload: () => void };
  history: { replaceState: (state: unknown, unused: string, url?: string) => void };
}

/** A window that records what the adapter did, in order. */
function fakeWindow(href: string): { win: FakeWindow; calls: string[] } {
  const calls: string[] = [];
  const win: FakeWindow = {
    location: {
      href,
      assign: (url) => calls.push(`assign ${url}`),
      reload: () => calls.push('reload'),
    },
    history: {
      replaceState: (state, _unused, url) => calls.push(`replaceState ${String(state)} ${url}`),
    },
  };
  return { win, calls };
}

describe('WindowPageReload', () => {
  it('assigns another page after clearing the current entry’s state, keeping its URL for Back', () => {
    const { win, calls } = fakeWindow('http://riviera.test/');

    new WindowPageReload(win as unknown as Window).to('/my-bookings');

    expect(calls).toEqual([
      'replaceState null http://riviera.test/',
      'assign http://riviera.test/my-bookings',
    ]);
  });

  it('reloads the current page instead of assigning it, so a fragment URL does not merely scroll', () => {
    const { win, calls } = fakeWindow('http://riviera.test/legal/privacy#data');

    new WindowPageReload(win as unknown as Window).to('/legal/privacy#data');

    expect(calls).toEqual(['replaceState null http://riviera.test/legal/privacy#data', 'reload']);
  });

  it('treats a fragment-only difference as the same page and reloads the target', () => {
    const { win, calls } = fakeWindow('http://riviera.test/legal/privacy?from=footer');

    new WindowPageReload(win as unknown as Window).to('/legal/privacy?from=footer#top');

    expect(calls).toEqual([
      'replaceState null http://riviera.test/legal/privacy?from=footer#top',
      'reload',
    ]);
  });

  it('treats a query difference as another page and assigns it', () => {
    const { win, calls } = fakeWindow('http://riviera.test/legal/privacy?from=footer');

    new WindowPageReload(win as unknown as Window).to('/legal/privacy?from=menu');

    expect(calls).toEqual([
      'replaceState null http://riviera.test/legal/privacy?from=footer',
      'assign http://riviera.test/legal/privacy?from=menu',
    ]);
  });
});

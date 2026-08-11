import { vi } from 'vitest';

import { trapFocusWithin } from './focus-trap';

/** A container attached to the document (focus() only works on attached elements). */
function container(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe('trapFocusWithin', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('wraps Tab from the last focusable back to the first', () => {
    const el = container('<button id="a">A</button><button id="b">B</button>');
    el.querySelector<HTMLButtonElement>('#b')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    const prevent = vi.spyOn(event, 'preventDefault');

    trapFocusWithin(el, event, false);

    expect(prevent).toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector('#a'));
  });

  it('wraps Shift+Tab from the first focusable to the last', () => {
    const el = container('<button id="a">A</button><button id="b">B</button>');
    el.querySelector<HTMLButtonElement>('#a')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
    const prevent = vi.spyOn(event, 'preventDefault');

    trapFocusWithin(el, event, true);

    expect(prevent).toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector('#b'));
  });

  it('does nothing when focus is mid-list (lets the browser move focus)', () => {
    const el = container(
      '<button id="a">A</button><button id="b">B</button><button id="c">C</button>',
    );
    el.querySelector<HTMLButtonElement>('#b')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    const prevent = vi.spyOn(event, 'preventDefault');

    trapFocusWithin(el, event, false);

    expect(prevent).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector('#b'));
  });

  it('is a safe no-op for a container with no focusables', () => {
    const el = container('<span>nothing focusable</span>');
    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    const prevent = vi.spyOn(event, 'preventDefault');

    expect(() => trapFocusWithin(el, event, false)).not.toThrow();
    expect(prevent).not.toHaveBeenCalled();
  });

  it('ignores disabled controls (excluded by the focusable selector)', () => {
    const el = container(
      '<button id="a">A</button><button id="b" disabled>B</button><button id="c">C</button>',
    );
    // Focus the last ENABLED control; forward Tab should wrap to the first.
    el.querySelector<HTMLButtonElement>('#c')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab' });

    trapFocusWithin(el, event, false);

    expect(document.activeElement).toBe(el.querySelector('#a'));
  });
});

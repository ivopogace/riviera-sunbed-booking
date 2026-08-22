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

/**
 * A roving tabindex (the availability calendar's day grid, and any toolbar or grid that grows one)
 * parks its inactive members at `tabindex="-1"`. They are still `<button>`s, so a selector that
 * matched them by tag would make the trap's "last focusable" an element Tab never reaches — and Tab
 * from the real last one would then escape the dialog instead of wrapping.
 */
describe('trapFocusWithin around a roving tabindex', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('wraps from the last TABBABLE element, ignoring parked tabindex="-1" controls', () => {
    const el = container(
      '<button id="a">A</button><button id="b" tabindex="0">B</button>' +
        '<button id="c" tabindex="-1">C</button><button id="d" tabindex="-1">D</button>',
    );
    el.querySelector<HTMLButtonElement>('#b')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    const prevent = vi.spyOn(event, 'preventDefault');

    trapFocusWithin(el, event, false);

    expect(prevent).toHaveBeenCalled();
    expect(document.activeElement).toBe(el.querySelector('#a'));
  });

  it('wraps backwards to the last TABBABLE element, not the last parked one', () => {
    const el = container(
      '<button id="a">A</button><button id="b" tabindex="0">B</button>' +
        '<button id="c" tabindex="-1">C</button>',
    );
    el.querySelector<HTMLButtonElement>('#a')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });

    trapFocusWithin(el, event, true);

    expect(document.activeElement).toBe(el.querySelector('#b'));
  });

  it('ignores a disabled select or textarea, which the browser will not tab to either', () => {
    const el = container(
      '<button id="a">A</button><select id="s" disabled></select>' +
        '<textarea id="t" disabled></textarea><button id="b">B</button>',
    );
    el.querySelector<HTMLButtonElement>('#b')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab' });

    trapFocusWithin(el, event, false);

    expect(document.activeElement).toBe(el.querySelector('#a'));
  });
});

import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SegmentedControl, SegmentedOption } from './segmented-control';

type Audience = 'tourist' | 'operator';

@Component({
  selector: 'app-segmented-control-host',
  imports: [SegmentedControl],
  template: `
    <app-segmented-control
      label="I want to"
      [options]="options"
      [(value)]="audience"
      [variant]="variant()"
    />
  `,
})
class SegmentedControlHost {
  readonly options: readonly SegmentedOption<Audience>[] = [
    {
      value: 'tourist',
      label: 'Book a sunbed',
      description: 'Find beaches and reserve your spot.',
    },
    {
      value: 'operator',
      label: 'Run a venue',
      description: 'List your beach and manage bookings.',
    },
  ];
  readonly audience = signal<Audience>('tourist');
  readonly variant = signal<'pill' | 'card'>('pill');
}

describe('SegmentedControl', () => {
  let fixture: ComponentFixture<SegmentedControlHost>;
  let host: SegmentedControlHost;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SegmentedControlHost] }).compileComponents();
    fixture = TestBed.createComponent(SegmentedControlHost);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  function group(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector('[role="radiogroup"]')!;
  }

  function options(): HTMLElement[] {
    return [...group().querySelectorAll<HTMLElement>('[role="radio"]')];
  }

  async function press(from: HTMLElement, key: string): Promise<void> {
    from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await fixture.whenStable();
  }

  it('exposes radiogroup semantics and moves selection with arrow keys', async () => {
    const opts = options();

    expect(opts.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    // Roving tabindex: exactly one stop in the tab order, and it is the checked option.
    expect(opts.map((o) => o.tabIndex)).toEqual([0, -1]);

    opts[0].focus();
    await press(opts[0], 'ArrowRight');

    expect(opts[1].getAttribute('aria-checked')).toBe('true');
    expect(opts.map((o) => o.tabIndex)).toEqual([-1, 0]);
    expect(document.activeElement).toBe(opts[1]);
  });

  it('wraps in both directions and honours Home/End', async () => {
    const opts = options();
    opts[0].focus();

    await press(opts[0], 'ArrowLeft'); // wraps backwards to the last option
    expect(host.audience()).toBe('operator');

    await press(opts[1], 'ArrowDown'); // ArrowDown is an alias for "next", wrapping to the first
    expect(host.audience()).toBe('tourist');

    await press(opts[0], 'End');
    expect(host.audience()).toBe('operator');

    await press(opts[1], 'Home');
    expect(host.audience()).toBe('tourist');
  });

  it('leaves other keys to the browser', async () => {
    const opts = options();
    await press(opts[0], 'Tab');

    expect(host.audience()).toBe('tourist');
  });

  it('writes the selection back through the two-way value on click', async () => {
    options()[1].click();
    await fixture.whenStable();

    expect(host.audience()).toBe('operator');
    expect(options()[1].getAttribute('aria-checked')).toBe('true');
  });

  it('reflects a value changed from outside the control', async () => {
    host.audience.set('operator');
    await fixture.whenStable();

    expect(options().map((o) => o.getAttribute('aria-checked'))).toEqual(['false', 'true']);
  });

  it('names the group for assistive technology', () => {
    expect(group().getAttribute('aria-label')).toBe('I want to');
  });

  it('shows each option description only in the card variant', async () => {
    // The pill variant is the compact audience tab strip — label only.
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'Find beaches and reserve your spot.',
    );

    host.variant.set('card');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Find beaches and reserve your spot.',
    );
    // The selected-state glyph is decorative — aria-checked already carries the state.
    expect(group().querySelector('[data-riv-check]')?.getAttribute('aria-hidden')).toBe('true');
  });
});

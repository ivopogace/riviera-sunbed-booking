import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { focusMover } from './focus-after-render';

/**
 * The shared focus mover. Every confirm-before-destroy surface in the app destroys the element that
 * was just activated, so focus has to be moved deliberately or it strands on `<body>` (WCAG 2.4.3).
 * The host below reproduces that shape: a trigger that reveals a target, and a close that takes
 * focus back to the trigger the target replaced.
 */
@Component({
  selector: 'app-focus-host',
  template: `
    <button type="button" data-testid="opener" (click)="open()">Open</button>
    <span data-testid="landmark">Status</span>
    @if (shown()) {
      <button type="button" data-testid="target">Target</button>
    }
  `,
})
class FocusHost {
  readonly shown = signal(false);
  readonly focus = focusMover();

  open(): void {
    this.shown.set(true);
    this.focus('target');
  }

  close(): void {
    this.shown.set(false);
    this.focus('opener');
  }

  /** The race: aim at a target a concurrent state change has already removed. */
  openIntoAVanishedTarget(): void {
    this.shown.set(false);
    this.focus('target', 'opener');
  }
}

describe('focusMover (#604)', () => {
  let fixture: ComponentFixture<FocusHost>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FocusHost] });
    fixture = TestBed.createComponent(FocusHost);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  function byId(testId: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  }

  it('focuses an element that only exists after the render it was asked from', async () => {
    expect(byId('target')).toBeNull();

    fixture.componentInstance.open();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(byId('target'));
  });

  it('takes focus back to an element that outlives the one it was on', async () => {
    fixture.componentInstance.open();
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.close();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(byId('target')).toBeNull();
    expect(document.activeElement).toBe(byId('opener'));
  });

  it('does not throw when nothing carries the test id', async () => {
    fixture.componentInstance.focus('no-such-hook');
    fixture.detectChanges();

    await expect(fixture.whenStable()).resolves.not.toThrow();
  });

  it('falls back to the named landmark when the primary target is gone', async () => {
    fixture.componentInstance.openIntoAVanishedTarget();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(byId('target')).toBeNull();
    expect(document.activeElement).toBe(byId('opener'));
  });

  it('falls back to the host when nothing named survives', async () => {
    fixture.componentInstance.focus('no-such-hook', 'no-such-fallback');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(host);
  });

  it('leaves a host it had to fall back to out of the tab order', async () => {
    fixture.componentInstance.focus('no-such-hook');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.getAttribute('tabindex')).toBe('-1');
  });

  it('makes a landmark that is not natively focusable land focus anyway', async () => {
    fixture.componentInstance.focus('no-such-hook', 'landmark');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(byId('landmark'));
  });

  it('leaves a natively focusable target in the tab order it already had', async () => {
    fixture.componentInstance.open();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(byId('target')?.getAttribute('tabindex')).toBeNull();
  });

  it('prefers the primary target over the fallback while both are live', async () => {
    fixture.componentInstance.open();
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.focus('target', 'opener');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(byId('target'));
  });

  it('scopes the lookup to its own host, never the whole document', async () => {
    const stray = document.createElement('button');
    stray.setAttribute('data-testid', 'outside');
    document.body.appendChild(stray);

    try {
      fixture.componentInstance.focus('outside');
      fixture.detectChanges();
      await fixture.whenStable();

      expect(document.activeElement).not.toBe(stray);
    } finally {
      stray.remove();
    }
  });
});

/** A state swap that may or may not tear down the focused control (#1410's pay page shape). */
@Component({
  selector: 'app-swap-host',
  template: `
    <a href="/" data-testid="keeper">Cancel</a>
    @if (step() === 'card') {
      <button type="button" data-testid="action">Pay</button>
    } @else {
      <h1 data-testid="title">Done</h1>
    }
    <div data-testid="frame-host" [hidden]="step() !== 'card'">
      <button type="button" data-testid="framed">Card field</button>
    </div>
  `,
})
class SwapHost {
  readonly step = signal<'card' | 'done'>('card');
  readonly focus = focusMover({ onlyIfLost: true });

  finish(): void {
    this.focus('title');
    this.step.set('done');
  }
}

describe('focusMover onlyIfLost (#1410)', () => {
  let fixture: ComponentFixture<SwapHost>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SwapHost] });
    fixture = TestBed.createComponent(SwapHost);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  function byId(testId: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  }

  async function finishFrom(focused: HTMLElement | null): Promise<void> {
    focused?.focus();
    fixture.componentInstance.finish();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('moves focus when the render removed the focused control', async () => {
    await finishFrom(byId('action'));

    expect(document.activeElement).toBe(byId('title'));
  });

  it('moves focus when the render hid the focused control', async () => {
    await finishFrom(byId('framed'));

    expect(document.activeElement).toBe(byId('title'));
  });

  it('leaves focus on a control the render kept', async () => {
    await finishFrom(byId('keeper'));

    expect(document.activeElement).toBe(byId('keeper'));
  });

  it('leaves focus that was never inside the host where it was', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      await finishFrom(outside);

      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });
});

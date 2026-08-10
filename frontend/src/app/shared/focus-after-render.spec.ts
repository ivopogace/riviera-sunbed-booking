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

  it('is a no-op when nothing carries the test id, rather than throwing', async () => {
    fixture.componentInstance.focus('no-such-hook');
    fixture.detectChanges();

    await expect(fixture.whenStable()).resolves.not.toThrow();
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

import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { hostFocusMover } from './focus-after-render';

@Component({
  selector: 'app-focus-host',
  template: `
    <button type="button" data-testid="trigger">Trigger</button>
    @if (open()) {
      <button type="button" data-testid="confirm">Confirm</button>
    }
  `,
})
class FocusHost {
  readonly open = signal(false);
  readonly focusAfterRender = hostFocusMover();
}

describe('hostFocusMover', () => {
  let fixture: ComponentFixture<FocusHost>;
  let host: FocusHost;

  beforeEach(() => {
    fixture = TestBed.createComponent(FocusHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function byId(testId: string): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="${testId}"]`,
    )!;
  }

  it('focuses a target that only exists after the render it is asked from', async () => {
    host.open.set(true);
    host.focusAfterRender('confirm');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(byId('confirm'));
  });

  it('no-ops on a target that never renders, leaving focus where it was', async () => {
    byId('trigger').focus();

    host.focusAfterRender('nothing-here');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(byId('trigger'));
  });
});

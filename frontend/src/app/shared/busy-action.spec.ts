import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BusyAction } from './busy-action';

@Component({
  selector: 'app-busy-host',
  imports: [BusyAction],
  template: `
    <button type="button" data-testid="action" [appBusy]="busy()" (click)="run()">Erase</button>
  `,
})
class BusyHost {
  readonly busy = signal(false);
  readonly runs = signal(0);

  run(): void {
    this.runs.update((n) => n + 1);
  }
}

describe('BusyAction', () => {
  let fixture: ComponentFixture<BusyHost>;
  let action: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BusyHost] });
    fixture = TestBed.createComponent(BusyHost);
    fixture.detectChanges();
    action = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="action"]',
    )!;
  });

  function setBusy(busy: boolean): void {
    fixture.componentInstance.busy.set(busy);
    fixture.detectChanges();
  }

  it('marks the control disabled to assistive tech without taking it out of the document', () => {
    setBusy(true);

    expect(action.getAttribute('aria-disabled')).toBe('true');
    expect(action.disabled).toBe(false);
  });

  it('carries no aria-disabled at all while idle, rather than a false', () => {
    expect(action.hasAttribute('aria-disabled')).toBe(false);
  });

  it('keeps focus on the control when it becomes busy', () => {
    action.focus();
    expect(document.activeElement).toBe(action);

    setBusy(true);

    expect(document.activeElement).toBe(action);
  });

  it('blocks the control own handler while busy', () => {
    setBusy(true);

    action.click();

    expect(fixture.componentInstance.runs()).toBe(0);
  });

  it('runs the handler normally while idle', () => {
    action.click();

    expect(fixture.componentInstance.runs()).toBe(1);
  });

  it('lets the busy control still be left by keyboard', () => {
    setBusy(true);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true });

    action.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(false);
  });

  it('goes inert and back without the caller re-arming anything', () => {
    setBusy(true);
    action.click();
    setBusy(false);

    action.click();

    expect(fixture.componentInstance.runs()).toBe(1);
  });
});

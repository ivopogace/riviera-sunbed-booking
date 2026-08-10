import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmPanel } from './confirm-panel';

/**
 * The operator console's confirm-before-destroy panel. The host below mirrors how both consumers
 * use it — the `@if` stays OUTSIDE the component, so the panel is created and destroyed with the
 * confirmation and can focus itself on the way in.
 */
@Component({
  selector: 'app-confirm-panel-host',
  imports: [ConfirmPanel],
  template: `
    <button type="button" data-testid="opener" (click)="open.set(true)">Open</button>
    @if (open()) {
      <app-confirm-panel
        label="Confirm remove set"
        message="Remove row A position 1 from the map?"
        confirmLabel="Remove set"
        [tone]="tone()"
        panelTestId="panel"
        confirmTestId="yes"
        cancelTestId="no"
        (confirmed)="confirmed = confirmed + 1"
        (cancelled)="cancelled = cancelled + 1"
      />
    }
  `,
})
class ConfirmPanelHost {
  readonly open = signal(false);
  readonly tone = signal<'destructive' | 'primary'>('destructive');
  confirmed = 0;
  cancelled = 0;
}

describe('ConfirmPanel (#604)', () => {
  let fixture: ComponentFixture<ConfirmPanelHost>;
  let host: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ConfirmPanelHost] });
    fixture = TestBed.createComponent(ConfirmPanelHost);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function byId(testId: string): HTMLElement {
    return host.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
  }

  it('is an alertdialog with an accessible name', () => {
    const panel = byId('panel');

    expect(panel.getAttribute('role')).toBe('alertdialog');
    expect(panel.getAttribute('aria-label')).toBe('Confirm remove set');
  });

  it('renders the message and the caller’s confirm label', () => {
    expect(byId('panel').textContent).toContain('Remove row A position 1 from the map?');
    expect(byId('yes').textContent?.trim()).toBe('Remove set');
    expect(byId('no').textContent?.trim()).toBe('Cancel');
  });

  it('moves focus onto the confirm button as it opens, rather than stranding it (WCAG 2.4.3)', () => {
    expect(document.activeElement).toBe(byId('yes'));
  });

  it('emits confirmed and cancelled without deciding anything itself', () => {
    byId('yes').click();
    expect(fixture.componentInstance.confirmed).toBe(1);
    expect(fixture.componentInstance.cancelled).toBe(0);

    byId('no').click();
    expect(fixture.componentInstance.cancelled).toBe(1);
    expect(fixture.componentInstance.confirmed).toBe(1);
  });

  it('carries the destructive ink by default and the primary ink on request', () => {
    expect(byId('yes').className).toContain('bg-[#a3160e]');

    fixture.componentInstance.tone.set('primary');
    fixture.detectChanges();

    expect(byId('yes').className).toContain('bg-[#0a5f74]');
  });

  it('keeps the warning surface both consumers already ship', () => {
    // Pinned so the extraction can't silently restyle either caller; the inks are AA-proven by the
    // two contrast specs, which stay untouched.
    expect(byId('panel').className).toContain('bg-[#fff4e0]');
    expect(byId('panel').className).toContain('border-[#e0a03a]/60');
  });

  it('gives both actions a 44px-tall touch target', () => {
    expect(byId('yes').className).toContain('min-h-11');
    expect(byId('no').className).toContain('min-h-11');
  });
});

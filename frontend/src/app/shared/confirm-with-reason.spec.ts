import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmWithReason } from './confirm-with-reason';

/**
 * The admin console's confirm-before-destroy panel. Unlike the operator pair it is bare — it sits
 * inside the row card it belongs to rather than bringing its own — and it collects the optional
 * grounds the audit trail records (ADR-0013).
 */
@Component({
  selector: 'app-confirm-with-reason-host',
  imports: [ConfirmWithReason],
  template: `
    <button type="button" data-testid="opener" (click)="open.set(true)">Remove</button>
    @if (open()) {
      <app-confirm-with-reason
        label="Confirm photo removal"
        prompt="Remove the hero photo from Miramar? This cannot be undone."
        promptTestId="prompt"
        reasonId="reason-hero"
        reasonPlaceholder="e.g. reported by email"
        confirmLabel="Remove"
        cancelLabel="Keep it"
        panelTestId="panel"
        confirmTestId="yes"
        cancelTestId="no"
        [busy]="busy()"
        [(reason)]="reason"
        (confirmed)="confirmed = confirmed + 1"
        (cancelled)="cancelled = cancelled + 1"
      />
    }
  `,
})
class ConfirmWithReasonHost {
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly reason = signal('');
  confirmed = 0;
  cancelled = 0;
}

describe('ConfirmWithReason (#604)', () => {
  let fixture: ComponentFixture<ConfirmWithReasonHost>;
  let host: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [ConfirmWithReasonHost] });
    fixture = TestBed.createComponent(ConfirmWithReasonHost);
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
    // The admin confirmations had neither before this component; the operator pair always did.
    expect(byId('panel').getAttribute('role')).toBe('alertdialog');
    expect(byId('panel').getAttribute('aria-label')).toBe('Confirm photo removal');
  });

  it('moves focus onto the confirm button as it opens (WCAG 2.4.3)', () => {
    expect(document.activeElement).toBe(byId('yes'));
  });

  it('labels the reason field against the input it describes', () => {
    const input = byId('reason-hero');
    const label = host.querySelector<HTMLLabelElement>('label')!;

    expect(input.id).toBe('reason-hero');
    expect(label.getAttribute('for')).toBe('reason-hero');
    expect(label.textContent?.trim()).toBe('Reason (optional)');
    expect(input.getAttribute('placeholder')).toBe('e.g. reported by email');
    expect(input.getAttribute('maxlength')).toBe('500');
  });

  it('propagates a typed reason back to the caller’s own signal', () => {
    const input = byId('reason-hero') as HTMLInputElement;

    input.value = 'off-topic image';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.reason()).toBe('off-topic image');
  });

  it('seeds the field from the caller’s signal rather than owning the value', () => {
    fixture.componentInstance.reason.set('DSAR-2026-08-10');
    fixture.detectChanges();

    expect((byId('reason-hero') as HTMLInputElement).value).toBe('DSAR-2026-08-10');
  });

  it('emits confirmed and cancelled without deciding anything itself', () => {
    byId('yes').click();
    expect(fixture.componentInstance.confirmed).toBe(1);

    byId('no').click();
    expect(fixture.componentInstance.cancelled).toBe(1);
  });

  it('disables only the destructive action while the caller is busy', () => {
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();

    expect((byId('yes') as HTMLButtonElement).disabled).toBe(true);
    expect((byId('no') as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders the prompt under the caller’s own test id', () => {
    expect(byId('prompt').textContent).toContain('Remove the hero photo from Miramar?');
  });
});

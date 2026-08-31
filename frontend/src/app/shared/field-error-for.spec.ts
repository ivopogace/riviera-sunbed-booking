import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FieldErrorFor } from './field-error-for';

@Component({
  selector: 'app-field-error-for-host',
  imports: [FieldErrorFor],
  template: `
    <label>
      <span>Your comment</span>
      <textarea #comment data-testid="comment"></textarea>
      @if (commentFailed()) {
        <span [appFieldErrorFor]="comment" role="alert" data-testid="comment-error"
          >Keep it under 500 characters.</span
        >
      }
    </label>
    <label>
      <span>Email</span>
      <p id="email-hint">We only use this for the receipt.</p>
      <input #email aria-describedby="email-hint" data-testid="email" />
      @if (emailFailed()) {
        <span [appFieldErrorFor]="email" role="alert" data-testid="email-error"
          >Enter an email address.</span
        >
      }
    </label>
    <label>
      <span>Full-day price</span>
      <input #price data-testid="price" />
      @if (priceWriteFailed()) {
        <span
          [appFieldErrorFor]="price"
          [appFieldErrorForInvalidValue]="false"
          role="alert"
          data-testid="price-error"
          >Your session has expired. Please sign in again.</span
        >
      }
    </label>
  `,
})
class FieldErrorForHost {
  readonly commentFailed = signal(false);
  readonly emailFailed = signal(false);
  readonly priceWriteFailed = signal(false);
}

/**
 * Scope: the association contract in both directions — taken while the error is on screen, released
 * when it leaves — and the composition case, where a control that already names a hint keeps naming
 * it first. jsdom cannot compute an accessible description; `frontend/e2e/review-a-stay.e2e.ts`
 * asserts the announced text in a real browser and that stays the mechanism's end-to-end proof.
 */
describe('FieldErrorFor', () => {
  let fixture: ComponentFixture<FieldErrorForHost>;
  let host: FieldErrorForHost;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FieldErrorForHost] });
    fixture = TestBed.createComponent(FieldErrorForHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function element(testid: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[data-testid="${testid}"]`,
    );
  }

  it('associates the error with its control while the error is showing', () => {
    host.commentFailed.set(true);
    fixture.detectChanges();

    const errorId = element('comment-error')!.id;
    expect(errorId).toBeTruthy();
    expect(element('comment')!.getAttribute('aria-describedby')).toBe(errorId);
    expect(element('comment')!.getAttribute('aria-invalid')).toBe('true');
  });

  it('releases the association when the error goes away', () => {
    host.commentFailed.set(true);
    fixture.detectChanges();
    // Pin the take first: an absence-only assertion also passes when nothing was ever written.
    expect(element('comment')!.getAttribute('aria-describedby')).toBe(element('comment-error')!.id);

    host.commentFailed.set(false);
    fixture.detectChanges();

    expect(element('comment-error')).toBeNull();
    expect(element('comment')!.hasAttribute('aria-describedby')).toBe(false);
    expect(element('comment')!.hasAttribute('aria-invalid')).toBe(false);
  });

  it('appends after an existing description and restores it', () => {
    host.emailFailed.set(true);
    fixture.detectChanges();

    const errorId = element('email-error')!.id;
    expect(element('email')!.getAttribute('aria-describedby')).toBe(`email-hint ${errorId}`);

    host.emailFailed.set(false);
    fixture.detectChanges();

    expect(element('email')!.getAttribute('aria-describedby')).toBe('email-hint');
    expect(element('email')!.hasAttribute('aria-invalid')).toBe(false);
  });

  it('describes the control without marking its value invalid when told not to', () => {
    host.priceWriteFailed.set(true);
    fixture.detectChanges();

    const errorId = element('price-error')!.id;
    expect(errorId).toBeTruthy();
    expect(element('price')!.getAttribute('aria-describedby')).toBe(errorId);
    expect(element('price')!.hasAttribute('aria-invalid')).toBe(false);
  });

  it('gives each error its own id', () => {
    host.commentFailed.set(true);
    host.emailFailed.set(true);
    fixture.detectChanges();

    expect(element('comment-error')!.id).not.toBe(element('email-error')!.id);
  });
});

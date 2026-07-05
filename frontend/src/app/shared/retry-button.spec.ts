import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { RetryButton } from './retry-button';

describe('RetryButton', () => {
  let fixture: ComponentFixture<RetryButton>;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RetryButton] }).compileComponents();
    fixture = TestBed.createComponent(RetryButton);
    fixture.componentRef.setInput('testId', 'retry');
    el = fixture.nativeElement as HTMLElement;
  });

  function button(): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('[data-testid="retry"]')!;
  }

  it('renders the default "Try again" label and the given test id', () => {
    fixture.detectChanges();
    expect(button().textContent?.trim()).toBe('Try again');
  });

  it('renders a custom label when given one', () => {
    fixture.componentRef.setInput('label', 'Retry loading');
    fixture.detectChanges();
    expect(button().textContent?.trim()).toBe('Retry loading');
  });

  it('emits retry on click', () => {
    fixture.detectChanges();
    const retried = vi.fn();
    fixture.componentInstance.retry.subscribe(retried);

    button().click();

    expect(retried).toHaveBeenCalledTimes(1);
  });
});

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required } from '@angular/forms/signals';

import { BookingCutoffField } from './booking-cutoff-field';

@Component({
  imports: [BookingCutoffField],
  template: `<app-booking-cutoff-field [field]="venueForm.bookingCutoff" testId="venue-cutoff" />`,
})
class Host {
  protected readonly model = signal({ bookingCutoff: '18:00' });
  protected readonly venueForm = form(this.model, (path) => {
    required(path.bookingCutoff, { message: 'Free-cancellation deadline is required' });
  });

  clear(): void {
    this.model.set({ bookingCutoff: '' });
    this.venueForm.bookingCutoff().markAsTouched();
  }
}

describe('BookingCutoffField', () => {
  function render() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, label: (fixture.nativeElement as HTMLElement).querySelector('label')! };
  }

  it('names the deadline role and the zone in the label — a Europe/Tirane wall clock (#794 relabel)', () => {
    expect(render().label.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Free-cancellation deadline (Europe/Tirane)',
    );
  });

  it('is a time input carrying the call site’s test id', () => {
    const input = render().label.querySelector<HTMLInputElement>('input')!;

    expect(input.type).toBe('time');
    expect(input.getAttribute('data-testid')).toBe('venue-cutoff');
  });

  it('stays quiet until the field is both touched and invalid', () => {
    expect(render().label.querySelector('[role="alert"]')).toBeNull();
  });

  it('announces the bound field’s validation message once touched and invalid', () => {
    const { fixture, label } = render();
    fixture.componentInstance.clear();
    fixture.detectChanges();

    expect(label.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Free-cancellation deadline is required',
    );
  });
});

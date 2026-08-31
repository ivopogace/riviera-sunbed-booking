import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import { BookingMode } from '../shared/venue-views';
import { BookingModeField } from './booking-mode-field';

@Component({
  imports: [BookingModeField],
  template: `<app-booking-mode-field
    [field]="venueForm.bookingMode"
    testId="venue-booking-mode"
  />`,
})
class Host {
  protected readonly model = signal<{ bookingMode: BookingMode }>({ bookingMode: 'INSTANT' });
  protected readonly venueForm = form(this.model);
}

describe('BookingModeField', () => {
  function label(): HTMLElement {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('label')!;
  }

  it('offers exactly the two booking modes, named as operators read them', () => {
    const options = label().querySelectorAll<HTMLOptionElement>('option');

    expect([...options].map((o) => [o.value, o.textContent?.trim()])).toEqual([
      ['INSTANT', 'Instant Book'],
      ['REQUEST', 'Request to Book'],
    ]);
  });

  it('labels the field in one voice and takes its test id from the call site', () => {
    expect(label().querySelector('span')?.textContent?.trim()).toBe('Booking mode');
    expect(label().querySelector('select')?.getAttribute('data-testid')).toBe('venue-booking-mode');
  });

  it('owns its <label>, and drops its host out of the form’s grid', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-booking-mode-field')?.classList.contains('contents')).toBe(true);
    expect(el.querySelector('label')?.querySelector('select')).not.toBeNull();
  });

  it('reflects the bound form field’s value', () => {
    expect(label().querySelector<HTMLSelectElement>('select')?.value).toBe('INSTANT');
  });
});

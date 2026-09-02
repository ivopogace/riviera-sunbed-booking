import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminVenuesService, ModerationVenue } from './admin-venues.service';
import { ModerationVenuePicker, moderationVenuePicker } from './moderation-venue-picker';

const VENUES: readonly ModerationVenue[] = [
  { id: 7, name: 'Bora Bora Beach', beach: 'Dhërmi' },
  { id: 9, name: 'Folie Marine', beach: 'Gjipe' },
];

@Component({ selector: 'app-picker-host', template: '' })
class PickerHost {
  readonly picker = moderationVenuePicker();
}

async function pickerWith(admin: boolean): Promise<ModerationVenuePicker> {
  await TestBed.configureTestingModule({
    imports: [PickerHost],
    providers: [
      {
        provide: OperatorAuth,
        useValue: { restoring: signal(false), signedIn: signal(true), isAdmin: signal(admin) },
      },
      { provide: AdminVenuesService, useValue: { venues: vi.fn().mockResolvedValue(VENUES) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(PickerHost);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.componentInstance.picker;
}

function pickEvent(value: string): Event {
  return { target: { value } } as unknown as Event;
}

describe('moderationVenuePicker', () => {
  it('loads the venue list only once the session is an admin one', async () => {
    expect((await pickerWith(false)).venues()).toEqual([]);
    TestBed.resetTestingModule();
    expect((await pickerWith(true)).venues()).toEqual(VENUES);
  });

  it('resolves the picked venue and reads "Choose a venue…" as no venue', async () => {
    const picker = await pickerWith(true);

    expect(picker.pick(pickEvent('9'))).toBe(9);
    expect(picker.selectedVenue()?.name).toBe('Folie Marine');
    expect(picker.isViewing(VENUES[1])).toBe(true);
    expect(picker.isViewing(VENUES[0])).toBe(false);

    expect(picker.pick(pickEvent(''))).toBeUndefined();
    expect(picker.selectedVenue()).toBeUndefined();
  });

  it('retires an in-flight load on the next pick and clears its pending state', async () => {
    const picker = await pickerWith(true);
    picker.pick(pickEvent('7'));
    const ticket = picker.beginLoad();
    picker.loading.set(true);
    picker.loadError.set(true);

    picker.pick(pickEvent('9'));

    expect(picker.isCurrent(ticket)).toBe(false);
    expect(picker.loading()).toBe(false);
    expect(picker.loadError()).toBe(false);
    expect(picker.isCurrent(picker.beginLoad())).toBe(true);
  });
});

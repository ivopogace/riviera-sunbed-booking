import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminVenuePhotos } from './admin-venue-photos';
import { AdminVenuePhotosService } from './admin-venue-photos.service';
import { AdminVenuePhotosView } from './admin.model';

/**
 * The admin console's Photos tab — the surface that makes the moderation takedown usable. Three
 * things matter here and nothing else does: an admin sees every slot of a venue it does not own,
 * a removal cannot happen on one click, and a non-admin never sees the surface at all.
 */
interface AuthState {
  restoring?: boolean;
  signedIn?: boolean;
  isAdmin?: boolean;
}

function authStub(state: AuthState = {}): OperatorAuth {
  return {
    restoring: signal(state.restoring ?? false),
    signedIn: signal(state.signedIn ?? true),
    isAdmin: signal(state.isAdmin ?? true),
    principalName: signal('admin-self'),
  } as unknown as OperatorAuth;
}

const VENUES = [
  { id: 7, name: 'Bora Bora Beach', beach: 'Dhërmi' },
  { id: 9, name: 'Folie Marine', beach: 'Gjipe' },
];

function photosOf(coverUrl: string | null, venueId = 7): AdminVenuePhotosView {
  return {
    venueId,
    slots: [
      { slot: 'cover', previewUrl: coverUrl },
      { slot: 'sunbeds', previewUrl: `/api/venues/${venueId}/photos/beef02` },
      { slot: 'bar', previewUrl: null },
    ],
  };
}

function serviceStub(): {
  venues: ReturnType<typeof vi.fn>;
  slots: ReturnType<typeof vi.fn>;
  takedown: ReturnType<typeof vi.fn>;
} {
  return {
    venues: vi.fn(async () => VENUES),
    slots: vi.fn(async (venueId: number) =>
      photosOf(`/api/venues/${venueId}/photos/beef01`, venueId),
    ),
    takedown: vi.fn(async () => undefined),
  };
}

/** A promise plus the handles that settle it — for driving out-of-order responses. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settle(fixture: ComponentFixture<AdminVenuePhotos>): Promise<void> {
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function render(
  auth: OperatorAuth,
  service: ReturnType<typeof serviceStub>,
): Promise<ComponentFixture<AdminVenuePhotos>> {
  await TestBed.configureTestingModule({
    imports: [AdminVenuePhotos],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: auth },
      { provide: AdminVenuePhotosService, useValue: service },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminVenuePhotos);
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

function byTestId<T extends HTMLElement>(
  fixture: ComponentFixture<AdminVenuePhotos>,
  id: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
}

/** Pick a venue in the native <select> and let the slots load. */
async function pickVenue(
  fixture: ComponentFixture<AdminVenuePhotos>,
  venueId: number,
): Promise<void> {
  const select = byTestId<HTMLSelectElement>(fixture, 'admin-photos-venue')!;
  select.value = Number.isNaN(venueId) ? '' : String(venueId);
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
  await settle(fixture);
}

describe('AdminVenuePhotos', () => {
  it('renders every slot, occupied and empty', async () => {
    const fixture = await render(authStub(), serviceStub());

    await pickVenue(fixture, 7);

    // All three slots are present whether or not they hold a photo — a stable grid, not a list.
    expect(byTestId(fixture, 'admin-photo-slot-cover')).not.toBeNull();
    expect(byTestId(fixture, 'admin-photo-slot-sunbeds')).not.toBeNull();
    expect(byTestId(fixture, 'admin-photo-slot-bar')).not.toBeNull();

    const cover = byTestId<HTMLImageElement>(fixture, 'admin-photo-preview-cover');
    expect(cover?.getAttribute('src')).toBe('/api/venues/7/photos/beef01');
    expect(byTestId(fixture, 'admin-photo-preview-bar')).toBeNull();
    expect(byTestId(fixture, 'admin-photo-empty-bar')).not.toBeNull();

    // An empty slot offers nothing to remove.
    expect(byTestId(fixture, 'admin-photo-remove-bar')).toBeNull();
    expect(byTestId(fixture, 'admin-photo-remove-cover')).not.toBeNull();
  });

  it('requires a second, target-naming confirmation before removing', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();

    // First press sends nothing — it only asks, and it names what is about to be destroyed.
    expect(service.takedown).not.toHaveBeenCalled();
    const prompt = byTestId(fixture, 'admin-photo-confirm-prompt-cover');
    expect(prompt?.textContent).toContain('Bora Bora Beach');
    expect(prompt?.textContent?.toLowerCase()).toContain('cover');

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-confirm-cover')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(service.takedown).toHaveBeenCalledWith(7, 'cover');
    // The slot empties in place; the venue is not re-fetched.
    expect(service.slots).toHaveBeenCalledTimes(1);
    expect(byTestId(fixture, 'admin-photo-preview-cover')).toBeNull();
    expect(byTestId(fixture, 'admin-photo-empty-cover')).not.toBeNull();
    // The untouched slot is undisturbed.
    expect(byTestId(fixture, 'admin-photo-preview-sunbeds')).not.toBeNull();
  });

  /** Grounds typed into the confirmation ride the takedown into the audit trail. */
  it('passes a typed reason to the takedown', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    const input = byTestId<HTMLInputElement>(fixture, 'admin-photo-reason-cover')!;
    input.value = '  reported by email  ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-confirm-cover')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(service.takedown).toHaveBeenCalledWith(7, 'cover', 'reported by email');
  });

  it('does not carry a reason typed for one takedown into the next (AC-6)', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    const input = byTestId<HTMLInputElement>(fixture, 'admin-photo-reason-cover')!;
    input.value = 'first grounds';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-cancel-cover')!.click();
    fixture.detectChanges();

    // Re-opened after a dismissal, the field is blank and an unstated reason stays unstated.
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    expect(byTestId<HTMLInputElement>(fixture, 'admin-photo-reason-cover')!.value).toBe('');
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-confirm-cover')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(service.takedown).toHaveBeenCalledWith(7, 'cover');
  });

  it('abandons a removal when the confirmation is dismissed', async () => {
    const service = serviceStub();
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-cancel-cover')!.click();
    fixture.detectChanges();

    expect(service.takedown).not.toHaveBeenCalled();
    expect(byTestId(fixture, 'admin-photo-confirm-prompt-cover')).toBeNull();
    expect(byTestId(fixture, 'admin-photo-preview-cover')).not.toBeNull();
  });

  /**
   * Two out-of-order-response races, both found at the review gate. They matter more here than on a
   * read-only surface: the moderator's decision to destroy bytes rests on the image in front of them
   * matching the venue the confirmation names, so a late response painting one venue's photos under
   * another venue's name is the exact failure the confirmation exists to prevent.
   */
  it('ignores a slots response that lands after the admin moved to another venue', async () => {
    const service = serviceStub();
    const slow = deferred<AdminVenuePhotosView>();
    service.slots.mockImplementation((venueId: number) =>
      venueId === 7 ? slow.promise : Promise.resolve(photosOf(null, venueId)),
    );
    const fixture = await render(authStub(), service);

    await pickVenue(fixture, 7); // still in flight
    await pickVenue(fixture, 9); // resolves first — venue 9 has no cover

    slow.resolve(photosOf('/api/venues/7/photos/beef01', 7)); // venue 7 answers late
    await settle(fixture);

    expect(byTestId(fixture, 'admin-photo-preview-cover')).toBeNull();
    expect(byTestId(fixture, 'admin-photo-empty-cover')).not.toBeNull();
  });

  it('does not empty a slot on the venue switched to while a takedown was in flight', async () => {
    const service = serviceStub();
    const slow = deferred<void>();
    service.takedown.mockImplementation(() => slow.promise);
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-confirm-cover')!.click();
    fixture.detectChanges();

    await pickVenue(fixture, 9); // switch away before the DELETE settles
    slow.resolve();
    await settle(fixture);

    // Venue 9's cover is untouched, and its outcome is not narrated under venue 9's name.
    expect(byTestId(fixture, 'admin-photo-preview-cover')).not.toBeNull();
    expect(byTestId(fixture, 'admin-photos-notice')?.textContent).not.toContain('Bora Bora Beach');
  });

  it('parks focus on the notice when a takedown fails', async () => {
    const service = serviceStub();
    service.takedown.mockRejectedValue(new Error('nope'));
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-confirm-cover')!.click();
    await settle(fixture);

    // The confirmation is gone, so the button focus was on no longer exists.
    expect(byTestId(fixture, 'admin-photo-confirm-cover')).toBeNull();
    expect(byTestId(fixture, 'admin-photos-notice')?.textContent).toContain('Could not remove');
    expect(document.activeElement).toBe(byTestId(fixture, 'admin-photos-notice'));
  });

  it('moves no focus when a failed takedown settles under another venue', async () => {
    const service = serviceStub();
    const slow = deferred<void>();
    service.takedown.mockImplementation(() => slow.promise);
    const fixture = await render(authStub(), service);
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-confirm-cover')!.click();
    fixture.detectChanges();

    await pickVenue(fixture, 9);
    const venuePicker = byTestId(fixture, 'admin-photos-venue');
    venuePicker!.focus();
    slow.reject(new Error('nope'));
    await settle(fixture);

    expect(document.activeElement).toBe(venuePicker);
  });

  it('stops loading when the admin deselects back to no venue mid-flight', async () => {
    // Deselecting issues no new request, so nothing else would ever turn the spinner off.
    const service = serviceStub();
    const slow = deferred<AdminVenuePhotosView>();
    service.slots.mockImplementation(() => slow.promise);
    const fixture = await render(authStub(), service);

    await pickVenue(fixture, 7);
    await pickVenue(fixture, Number.NaN); // the blank "Choose a venue…" option
    slow.resolve(photosOf('/api/venues/7/photos/beef01', 7));
    await settle(fixture);

    expect(byTestId(fixture, 'admin-photos-loading')).toBeNull();
    expect(byTestId(fixture, 'admin-photo-slot-cover')).toBeNull();
  });

  it('keeps the newest answer when the same venue is re-requested out of order', async () => {
    // Leaving a venue and returning re-requests it, so "is this venue still selected" is not a
    // staleness test — both answers pass it. Only "is this the newest request" is monotonic.
    const service = serviceStub();
    const first = deferred<AdminVenuePhotosView>();
    const second = deferred<AdminVenuePhotosView>();
    const answers = [first.promise, second.promise];
    service.slots.mockImplementation(() => answers.shift() ?? Promise.resolve(photosOf(null, 7)));
    const fixture = await render(authStub(), service);

    await pickVenue(fixture, 7); // request #1
    await pickVenue(fixture, 9);
    await pickVenue(fixture, 7); // request #2, same venue

    second.resolve(photosOf(null, 7)); // the newest answer: cover now empty
    await settle(fixture);
    first.resolve(photosOf('/api/venues/7/photos/stale', 7)); // the older answer lands last
    await settle(fixture);

    expect(byTestId(fixture, 'admin-photo-empty-cover')).not.toBeNull();
    expect(byTestId(fixture, 'admin-photo-preview-cover')).toBeNull();
  });

  /**
   * WCAG 2.4.3 — the recurring stranded-focus class. Each transition destroys the
   * control that was just activated, so without a deliberate move focus falls back to `<body>` and a
   * keyboard user loses their place mid-decision on an irreversible action.
   */
  it('moves focus onto the confirmation rather than stranding it', async () => {
    const fixture = await render(authStub(), serviceStub());
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-photo-confirm-cover'));
  });

  it('returns focus to Remove when the confirmation is dismissed', async () => {
    const fixture = await render(authStub(), serviceStub());
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    await settle(fixture);
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-cancel-cover')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-photo-remove-cover'));
  });

  it('parks focus on the slot card once the photo is gone', async () => {
    // The Remove button it was on no longer exists, so there is nothing to return focus to.
    const fixture = await render(authStub(), serviceStub());
    await pickVenue(fixture, 7);

    byTestId<HTMLButtonElement>(fixture, 'admin-photo-remove-cover')!.click();
    fixture.detectChanges();
    await settle(fixture);
    byTestId<HTMLButtonElement>(fixture, 'admin-photo-confirm-cover')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(document.activeElement).toBe(byTestId(fixture, 'admin-photo-slot-cover'));
  });

  it('self-gates on the admin session', async () => {
    const service = serviceStub();
    const fixture = await render(authStub({ isAdmin: false }), service);

    expect(byTestId(fixture, 'admin-photos-forbidden')).not.toBeNull();
    expect(byTestId(fixture, 'admin-photos-venue')).toBeNull();
    // A signed-out visitor is never told which admin surfaces exist.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-admin-console-tabs'),
    ).toBeNull();
    expect(service.venues).not.toHaveBeenCalled();
  });

  it('offers a retry when the slots fail to load', async () => {
    const service = serviceStub();
    service.slots.mockRejectedValueOnce(new Error('boom'));
    const fixture = await render(authStub(), service);

    await pickVenue(fixture, 7);

    expect(byTestId(fixture, 'admin-photos-error')).not.toBeNull();
    byTestId<HTMLButtonElement>(fixture, 'admin-photos-retry')!.click();
    fixture.detectChanges();
    await settle(fixture);

    expect(byTestId(fixture, 'admin-photos-error')).toBeNull();
    expect(byTestId(fixture, 'admin-photo-preview-cover')).not.toBeNull();
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminVenuePhotos } from './admin-venue-photos';
import { AdminVenuePhotosService } from './admin-venue-photos.service';
import { AdminVenuesService } from './admin-venues.service';
import { AdminVenuePhotosView } from './admin.model';

/**
 * Structural axe audit of the admin console's Photos tab: the tab strip, the labelled venue
 * picker, the slot grid (occupied slots carry an `<img>` that needs a real alt, empty ones carry a
 * text placeholder), and the polite live region that announces a removal.
 *
 * <p>Audited **with the confirmation open** as well as closed, because that state is where the extra
 * semantics live — two more buttons and a prompt appearing in place — and it is the state a
 * moderator actually reads before destroying something. Contrast is not measurable by axe under
 * jsdom; the e2e proves it against a real render.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

const PHOTOS: AdminVenuePhotosView = {
  venueId: 7,
  slots: [
    { slot: 'cover', previewUrl: '/api/venues/7/photos/beef01' },
    { slot: 'sunbeds', previewUrl: '/api/venues/7/photos/beef02' },
    { slot: 'bar', previewUrl: null },
  ],
};

const venuesStub: Partial<AdminVenuesService> = {
  venues: () => Promise.resolve([{ id: 7, name: 'Bora Bora Beach', beach: 'Dhërmi' }]),
};

function serviceStub(): Partial<AdminVenuePhotosService> {
  return {
    slots: () => Promise.resolve(PHOTOS),
    takedown: () => Promise.resolve(undefined),
  };
}

async function settle(fixture: ComponentFixture<AdminVenuePhotos>): Promise<void> {
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function renderWithVenuePicked(): Promise<ComponentFixture<AdminVenuePhotos>> {
  await TestBed.configureTestingModule({
    imports: [AdminVenuePhotos],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminVenuesService, useValue: venuesStub },
      { provide: AdminVenuePhotosService, useValue: serviceStub() },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminVenuePhotos);
  fixture.detectChanges();
  await settle(fixture);

  const select: HTMLSelectElement = (fixture.nativeElement as HTMLElement).querySelector(
    '[data-testid="admin-photos-venue"]',
  )!;
  select.value = '7';
  select.dispatchEvent(new Event('change'));
  fixture.detectChanges();
  await settle(fixture);
  return fixture;
}

describe('AdminVenuePhotos a11y', () => {
  it('has no axe violations showing a venue’s slots', async () => {
    const fixture = await renderWithVenuePicked();

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no axe violations while a takedown confirmation is open', async () => {
    const fixture = await renderWithVenuePicked();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('[data-testid="admin-photo-remove-cover"]')!
      .click();
    fixture.detectChanges();

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

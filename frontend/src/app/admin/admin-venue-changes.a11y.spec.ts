import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminVenueChanges } from './admin-venue-changes';
import { AdminVenueChangesService } from './admin-venue-changes.service';
import { AdminVenuesService } from './admin-venues.service';
import { VenueChangeRefundsView } from './admin.model';

/**
 * Structural axe audit of the admin console's Venue changes tab: the titled card, the captioned
 * table inside its focusable scroll region, and the empty state. Rendered with rows and again with
 * none, since the card's body swaps between the two. Contrast is not measurable by axe under jsdom;
 * it is proven in `admin-venue-changes.contrast.spec.ts`.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

const REPORT: VenueChangeRefundsView = {
  venues: [{ venueId: 3, refundCount: 2, refundedMinor: 14000, feeMinor: 1000, currency: 'EUR' }],
};

async function render(
  report: VenueChangeRefundsView,
): Promise<ComponentFixture<AdminVenueChanges>> {
  await TestBed.configureTestingModule({
    imports: [AdminVenueChanges],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      { provide: AdminVenueChangesService, useValue: { report: () => Promise.resolve(report) } },
      {
        provide: AdminVenuesService,
        useValue: { venues: () => Promise.resolve([{ id: 3, name: 'Miramar', beach: 'Ksamil' }]) },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminVenueChanges);
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminVenueChanges accessibility', () => {
  it('has no axe violations with venue-caused refunds listed', async () => {
    const fixture = await render(REPORT);
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no axe violations in the empty state', async () => {
    const fixture = await render({ venues: [] });
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

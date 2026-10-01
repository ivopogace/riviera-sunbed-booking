import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { AdminPayouts } from './admin-payouts';
import { AdminPayoutsService } from './admin-payouts.service';
import { AdminVenuesService } from './admin-venues.service';
import { PayoutBatchView } from './admin.model';

/**
 * Structural axe audit of the admin console's Payouts tab: the labelled week field and its two
 * actions, the live notice, the titled batch card with its captioned table inside a focusable scroll
 * region, and the empty state. Contrast is not measurable by axe under jsdom; the tab paints only
 * the card and field tokens the Venue changes tab's contrast spec already proves.
 */
const authStub = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  principalName: signal('admin-self'),
} as unknown as OperatorAuth;

const BATCHES: readonly PayoutBatchView[] = [
  {
    id: 11,
    venueId: 3,
    periodKey: '2026-W25',
    totalNetMinor: 9350,
    currency: 'EUR',
    status: 'DRAFT',
  },
  {
    id: 12,
    venueId: 3,
    periodKey: '2026-W25',
    totalNetMinor: -1250,
    currency: 'EUR',
    status: 'REPORTED',
  },
];

async function render(
  batches: readonly PayoutBatchView[],
): Promise<ComponentFixture<AdminPayouts>> {
  await TestBed.configureTestingModule({
    imports: [AdminPayouts],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub },
      {
        provide: AdminPayoutsService,
        useValue: {
          forPeriod: () => Promise.resolve(batches),
          generate: () => Promise.resolve(batches),
          markReported: () => Promise.resolve(batches[0]),
          markSettled: () => Promise.resolve(batches[0]),
        },
      },
      {
        provide: AdminVenuesService,
        useValue: { venues: () => Promise.resolve([{ id: 3, name: 'Miramar', beach: 'KSAMIL' }]) },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminPayouts);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminPayouts a11y', () => {
  it('has no axe violations with batches', async () => {
    const fixture = await render(BATCHES);

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('has no axe violations when the week is empty', async () => {
    const fixture = await render([]);

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

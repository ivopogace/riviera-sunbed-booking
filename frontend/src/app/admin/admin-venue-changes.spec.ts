import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminVenueChanges } from './admin-venue-changes';
import { AdminVenueChangesService } from './admin-venue-changes.service';
import { AdminVenuesService } from './admin-venues.service';
import { VenueChangeFeeView, VenueChangeRefundsView } from './admin.model';

/**
 * The admin console's Venue changes tab: venue-caused refunds per venue with count, what was returned
 * to guests and what the venue paid in fees. The two amounts are separate columns — a fee is not part
 * of a refund — and the venue's name is joined from the admin venue list, since the report ships ids.
 */
const REPORT: VenueChangeRefundsView = {
  venues: [
    { venueId: 3, refundCount: 2, refundedMinor: 14000, feeMinor: 1000, currency: 'EUR' },
    { venueId: 7, refundCount: 1, refundedMinor: 2000, feeMinor: 500, currency: 'EUR' },
  ],
};

const VENUES = [
  { id: 3, name: 'Miramar Beach Club', beach: 'Ksamil' },
  { id: 7, name: 'Bora Bora', beach: 'Dhërmi' },
];

const FEE: VenueChangeFeeView = { amountMinor: 500, currency: 'EUR' };

function authStub(isAdmin = true): OperatorAuth {
  return {
    restoring: signal(false),
    signedIn: signal(true),
    isAdmin: signal(isAdmin),
    principalName: signal('admin-self'),
  } as unknown as OperatorAuth;
}

interface Stubs {
  readonly fee?: () => Promise<VenueChangeFeeView>;
  readonly setFee?: (amountMinor: number, reason?: string) => Promise<VenueChangeFeeView>;
}

async function render(
  report: () => Promise<VenueChangeRefundsView>,
  venues: () => Promise<readonly { id: number; name: string; beach: string }[]> = () =>
    Promise.resolve(VENUES),
  stubs: Stubs = {},
): Promise<ComponentFixture<AdminVenueChanges>> {
  const changes = {
    report,
    fee: stubs.fee ?? (() => Promise.resolve(FEE)),
    setFee: stubs.setFee ?? (() => Promise.resolve(FEE)),
  };
  await TestBed.configureTestingModule({
    imports: [AdminVenueChanges],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub() },
      { provide: AdminVenueChangesService, useValue: changes },
      { provide: AdminVenuesService, useValue: { venues } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminVenueChanges);
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

/** Arm the fee editor and settle the render it triggers. */
async function armEditor(fixture: ComponentFixture<AdminVenueChanges>): Promise<HTMLElement> {
  const host = fixture.nativeElement as HTMLElement;
  byId(host, 'admin-venue-change-fee-edit')!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return host;
}

/** Type into the editor's amount field the way a user does, and settle. */
async function typeAmount(
  fixture: ComponentFixture<AdminVenueChanges>,
  value: string,
): Promise<void> {
  const host = fixture.nativeElement as HTMLElement;
  const input = byId(host, 'admin-venue-change-fee-input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Press Save fee and settle the write it starts. */
async function save(fixture: ComponentFixture<AdminVenueChanges>): Promise<void> {
  const host = fixture.nativeElement as HTMLElement;
  byId(host, 'admin-venue-change-fee-save')!.click();
  fixture.detectChanges();
  await fixture.whenStable();
  await fixture.whenStable();
  fixture.detectChanges();
}

function byId(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

describe('AdminVenueChanges', () => {
  it('lists venue-caused refunds per venue with count, amount and fee', async () => {
    const fixture = await render(() => Promise.resolve(REPORT));
    const host = fixture.nativeElement as HTMLElement;

    const rows = host.querySelectorAll<HTMLElement>('[data-testid="venue-change-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Miramar Beach Club');
    expect(rows[0].textContent).toContain('2');
    expect(rows[0].textContent).toContain('€140');
    expect(rows[0].textContent).toContain('€10');
    expect(rows[1].textContent).toContain('Bora Bora');
    expect(rows[1].textContent).toContain('€20');
    expect(rows[1].textContent).toContain('€5');
  });

  it('names the fee and the refund in separate columns, so neither reads as the other', async () => {
    const fixture = await render(() => Promise.resolve(REPORT));
    const host = fixture.nativeElement as HTMLElement;

    const headers = [...host.querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Venue', 'Refunds', 'Returned to guests', 'Fees paid']);
    expect(byId(host, 'venue-change-fee')?.textContent).toContain('€10');
  });

  it('falls back to the venue id when the venue list does not name it', async () => {
    const fixture = await render(
      () => Promise.resolve(REPORT),
      () => Promise.resolve([]),
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Venue #3');
  });

  it('carries no booking id or code onto the surface', async () => {
    const fixture = await render(() => Promise.resolve(REPORT));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).not.toMatch(/\bcode\b/i);
    expect(host.textContent).not.toMatch(/booking #/i);
  });

  it('shows an empty state when no remodel has refunded anyone', async () => {
    const fixture = await render(() => Promise.resolve({ venues: [] }));
    const host = fixture.nativeElement as HTMLElement;

    expect(byId(host, 'admin-venue-changes-empty')).toBeTruthy();
    expect(byId(host, 'admin-venue-changes-card')).toBeNull();
  });

  it('shows an error card (not a false empty state) when the report fails, and retries', async () => {
    const report = vi
      .fn<() => Promise<VenueChangeRefundsView>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(REPORT);
    const fixture = await render(report);
    const host = fixture.nativeElement as HTMLElement;

    expect(byId(host, 'admin-venue-changes-error')).toBeTruthy();
    expect(byId(host, 'admin-venue-changes-empty')).toBeNull();

    byId(host, 'admin-venue-changes-error')!.querySelector('button')!.click();
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId(host, 'admin-venue-changes-error')).toBeNull();
    expect(host.querySelectorAll('[data-testid="venue-change-row"]')).toHaveLength(2);
  });

  it('shows the fee in force', async () => {
    const fixture = await render(() => Promise.resolve(REPORT));
    const host = fixture.nativeElement as HTMLElement;

    expect(byId(host, 'admin-venue-change-fee-amount')?.textContent).toContain('€5');
  });

  it('shows the fee card even when no venue has caused a refund yet', async () => {
    const fixture = await render(() => Promise.resolve({ venues: [] }));
    const host = fixture.nativeElement as HTMLElement;

    expect(byId(host, 'admin-venue-change-fee-card')).toBeTruthy();
    expect(byId(host, 'admin-venue-changes-empty')).toBeTruthy();
  });

  /**
   * The write carries minor units (invariant #5) and the response replaces what the card shows, so
   * the page never re-reads the report to learn its own write.
   */
  it('writes the fee and splices the response', async () => {
    const setFee = vi.fn(() => Promise.resolve({ amountMinor: 700, currency: 'EUR' }));
    const fixture = await render(() => Promise.resolve(REPORT), undefined, { setFee });
    await armEditor(fixture);
    await typeAmount(fixture, '7');
    await save(fixture);
    const host = fixture.nativeElement as HTMLElement;

    expect(setFee).toHaveBeenCalledWith(700, '');
    expect(byId(host, 'admin-venue-change-fee-amount')?.textContent).toContain('€7');
    expect(byId(host, 'admin-venue-change-fee-editor')).toBeNull();
    expect(byId(host, 'admin-venue-change-fee-notice')?.textContent).toContain('€7');
  });

  it('carries the typed grounds into the write', async () => {
    const setFee = vi.fn(() => Promise.resolve({ amountMinor: 700, currency: 'EUR' }));
    const fixture = await render(() => Promise.resolve(REPORT), undefined, { setFee });
    const host = await armEditor(fixture);
    await typeAmount(fixture, '7');
    const reason = byId(host, 'admin-venue-change-fee-reason') as HTMLInputElement;
    reason.value = 'Board approved';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await save(fixture);

    expect(setFee).toHaveBeenCalledWith(700, 'Board approved');
  });

  it('opens the editor on the amount already in force', async () => {
    const fixture = await render(() => Promise.resolve(REPORT));
    const host = await armEditor(fixture);

    expect((byId(host, 'admin-venue-change-fee-input') as HTMLInputElement).value).toBe('5');
  });

  /**
   * The shared euros parser clamps a negative to zero, which here would silently make venue changes
   * free — so the field refuses it rather than sending a legitimate-looking 0.
   */
  it('refuses an out-of-range amount without calling the API', async () => {
    const setFee = vi.fn(() => Promise.resolve(FEE));
    const fixture = await render(() => Promise.resolve(REPORT), undefined, { setFee });
    await armEditor(fixture);

    for (const typed of ['', '-5', '2000']) {
      await typeAmount(fixture, typed);
      await save(fixture);
      const host = fixture.nativeElement as HTMLElement;
      expect(byId(host, 'admin-venue-change-fee-input-error')).toBeTruthy();
      expect(byId(host, 'admin-venue-change-fee-editor')).toBeTruthy();
    }

    expect(setFee).not.toHaveBeenCalled();
  });

  it('reports a failed write and keeps the editor open', async () => {
    const setFee = vi.fn(() => Promise.reject(new Error('boom')));
    const fixture = await render(() => Promise.resolve(REPORT), undefined, { setFee });
    await armEditor(fixture);
    await typeAmount(fixture, '7');
    await save(fixture);
    const host = fixture.nativeElement as HTMLElement;

    expect(byId(host, 'admin-venue-change-fee-error')).toBeTruthy();
    expect(byId(host, 'admin-venue-change-fee-editor')).toBeTruthy();
    expect(byId(host, 'admin-venue-change-fee-amount')?.textContent).toContain('€5');
  });

  it('cards a failed fee read like a failed report read', async () => {
    const fixture = await render(() => Promise.resolve(REPORT), undefined, {
      fee: () => Promise.reject(new Error('boom')),
    });
    const host = fixture.nativeElement as HTMLElement;

    expect(byId(host, 'admin-venue-changes-error')).toBeTruthy();
    expect(byId(host, 'admin-venue-change-fee-card')).toBeNull();
  });
});

import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { AdminPayouts } from './admin-payouts';
import { AdminPayoutsService } from './admin-payouts.service';
import { AdminVenuesService } from './admin-venues.service';
import { PayoutBatchView } from './admin.model';

/**
 * The admin console's Payouts tab: an ISO week's per-venue batches, generated from the ledger,
 * reported at the total on screen and then settled. Reporting sends the displayed total, and a
 * `TOTAL_CHANGED` refusal re-reads the week so the admin reviews the new figure (#1320).
 */
const DRAFT: PayoutBatchView = {
  id: 11,
  venueId: 3,
  periodKey: '2026-W25',
  totalNetMinor: 9350,
  currency: 'EUR',
  status: 'DRAFT',
};

const REPORTED: PayoutBatchView = {
  id: 12,
  venueId: 7,
  periodKey: '2026-W25',
  totalNetMinor: -1250,
  currency: 'EUR',
  status: 'REPORTED',
};

const VENUES = [
  { id: 3, name: 'Miramar Beach Club', beach: 'KSAMIL' },
  { id: 7, name: 'Bora Bora', beach: 'DHERMI' },
];

function authStub(): OperatorAuth {
  return {
    restoring: signal(false),
    signedIn: signal(true),
    isAdmin: signal(true),
    principalName: signal('admin-self'),
  } as unknown as OperatorAuth;
}

function conflict(code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: { code } });
}

interface PayoutsStub {
  forPeriod: ReturnType<typeof vi.fn<(period: string) => Promise<readonly PayoutBatchView[]>>>;
  generate: ReturnType<typeof vi.fn<(period: string) => Promise<readonly PayoutBatchView[]>>>;
  markReported: ReturnType<typeof vi.fn<(id: number, total: number) => Promise<PayoutBatchView>>>;
  markSettled: ReturnType<typeof vi.fn<(id: number) => Promise<PayoutBatchView>>>;
}

function payoutsStub(batches: readonly PayoutBatchView[] = [DRAFT, REPORTED]): PayoutsStub {
  return {
    forPeriod: vi.fn(() => Promise.resolve(batches)),
    generate: vi.fn(() => Promise.resolve(batches)),
    markReported: vi.fn(() => Promise.resolve({ ...DRAFT, status: 'REPORTED' as const })),
    markSettled: vi.fn(() => Promise.resolve({ ...REPORTED, status: 'SETTLED' as const })),
  };
}

/** The stubs answer with plain promises Angular does not track, so a macrotask drains them. */
async function settle(fixture: ComponentFixture<AdminPayouts>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

async function render(
  payouts: PayoutsStub,
  venues: () => Promise<typeof VENUES> = () => Promise.resolve(VENUES),
): Promise<ComponentFixture<AdminPayouts>> {
  await TestBed.configureTestingModule({
    imports: [AdminPayouts],
    providers: [
      provideRouter([]),
      { provide: OperatorAuth, useValue: authStub() },
      { provide: AdminPayoutsService, useValue: payouts },
      { provide: AdminVenuesService, useValue: { venues } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminPayouts);
  await settle(fixture);
  return fixture;
}

function byId(host: HTMLElement, testId: string): HTMLElement | null {
  return host.querySelector(`[data-testid="${testId}"]`);
}

function text(host: HTMLElement, testId: string): string {
  return byId(host, testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function rowTexts(host: HTMLElement): string[] {
  return [...host.querySelectorAll('[data-testid="payout-batch-row"]')].map(
    (row) => row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  );
}

async function setPeriod(fixture: ComponentFixture<AdminPayouts>, value: string): Promise<void> {
  const input = byId(
    fixture.nativeElement as HTMLElement,
    'admin-payouts-period',
  ) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

describe('AdminPayouts', () => {
  it("opens on this week in Tirane and lists each venue's batch by name", async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    const host = fixture.nativeElement as HTMLElement;

    expect(payouts.forPeriod).toHaveBeenCalledWith('2026-W25');
    expect((byId(host, 'admin-payouts-period') as HTMLInputElement).value).toBe('2026-W25');
    expect(text(host, 'admin-payouts-card')).toContain('Batches for 2026-W25');
    const rows = rowTexts(host);
    expect(rows[0]).toContain('Miramar Beach Club');
    expect(rows[0]).toContain('€93.50');
    expect(rows[0]).toContain('Draft');
    expect(rows[1]).toContain('Bora Bora');
    expect(rows[1]).toContain('-€12.50');
    expect(rows[1]).toContain('Reported');
  });

  it('offers Report on a draft and Mark settled on a reported batch, nothing on a settled one', async () => {
    const settled: PayoutBatchView = { ...REPORTED, id: 13, status: 'SETTLED' };
    const fixture = await render(payoutsStub([DRAFT, REPORTED, settled]));
    const host = fixture.nativeElement as HTMLElement;

    expect(text(host, 'payout-batch-report-11')).toBe('Report at €93.50 for Miramar Beach Club');
    expect(byId(host, 'payout-batch-settle-11')).toBeNull();
    expect(text(host, 'payout-batch-settle-12')).toBe('Mark settled for Bora Bora');
    expect(byId(host, 'payout-batch-report-13')).toBeNull();
    expect(byId(host, 'payout-batch-settle-13')).toBeNull();
  });

  /** One region, mounted before the read, speaks both legs; the visible copy is decoration. */
  it('announces the load and its landing from the one live region', async () => {
    let land!: (batches: readonly PayoutBatchView[]) => void;
    const payouts = payoutsStub();
    payouts.forPeriod.mockImplementationOnce(() => new Promise((resolve) => (land = resolve)));
    await TestBed.configureTestingModule({
      imports: [AdminPayouts],
      providers: [
        provideRouter([]),
        { provide: OperatorAuth, useValue: authStub() },
        { provide: AdminPayoutsService, useValue: payouts },
        { provide: AdminVenuesService, useValue: { venues: () => Promise.resolve(VENUES) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminPayouts);
    await settle(fixture);
    const host = fixture.nativeElement as HTMLElement;
    const announcer = byId(host, 'load-announcer')!;
    expect(announcer.textContent?.trim()).toBe('Loading payout batches…');
    expect(byId(host, 'admin-payouts-loading')!.getAttribute('aria-hidden')).toBe('true');

    land([DRAFT]);
    await settle(fixture);

    expect(byId(host, 'load-announcer')).toBe(announcer);
    expect(announcer.textContent?.trim()).toBe('Payout batches loaded.');
  });

  it('starts no second read while one is in flight', async () => {
    let land!: (batches: readonly PayoutBatchView[]) => void;
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    payouts.forPeriod.mockImplementationOnce(() => new Promise((resolve) => (land = resolve)));
    const host = fixture.nativeElement as HTMLElement;

    byId(host, 'admin-payouts-show')!.click();
    await settle(fixture);
    byId(host, 'admin-payouts-show')!.click();
    byId(host, 'admin-payouts-generate')!.click();
    await settle(fixture);
    land([DRAFT]);
    await settle(fixture);

    expect(payouts.forPeriod).toHaveBeenCalledTimes(2);
    expect(payouts.generate).not.toHaveBeenCalled();
  });

  it('still lists the batches by id when the venue names cannot be read', async () => {
    const fixture = await render(payoutsStub([DRAFT]), () => Promise.reject(new Error('offline')));

    expect(rowTexts(fixture.nativeElement as HTMLElement)[0]).toContain('Venue #3');
  });

  it('moves focus from Retry to the batches it brought back', async () => {
    const payouts = payoutsStub();
    payouts.forPeriod.mockRejectedValueOnce(new HttpErrorResponse({ status: 502 }));
    const fixture = await render(payouts);
    const host = fixture.nativeElement as HTMLElement;
    const retry = byId(host, 'admin-payouts-retry')!;
    retry.focus();

    retry.click();
    await settle(fixture);
    await settle(fixture);

    expect(document.activeElement).toBe(byId(host, 'admin-payouts-card'));
  });

  it('names a venue the admin list lacks by its id rather than dropping the batch', async () => {
    const fixture = await render(payoutsStub([{ ...DRAFT, venueId: 99 }]));

    expect(rowTexts(fixture.nativeElement as HTMLElement)[0]).toContain('Venue #99');
  });

  it('says so when the week has no batches', async () => {
    const fixture = await render(payoutsStub([]));

    expect(text(fixture.nativeElement as HTMLElement, 'admin-payouts-empty')).toContain(
      'No batches for 2026-W25',
    );
  });

  it('shows the week in the field', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    await setPeriod(fixture, '2026-W24');

    byId(fixture.nativeElement as HTMLElement, 'admin-payouts-show')!.click();
    await settle(fixture);

    expect(payouts.forPeriod).toHaveBeenLastCalledWith('2026-W24');
    expect(text(fixture.nativeElement as HTMLElement, 'admin-payouts-card')).toContain(
      'Batches for 2026-W24',
    );
  });

  it('refuses an empty week without a request', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    await setPeriod(fixture, '');

    byId(fixture.nativeElement as HTMLElement, 'admin-payouts-generate')!.click();
    await settle(fixture);

    expect(payouts.generate).not.toHaveBeenCalled();
    expect(text(fixture.nativeElement as HTMLElement, 'admin-payouts-period-error')).toContain(
      'Choose a week',
    );
  });

  it('generates the week and announces how many batches it has', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);

    byId(fixture.nativeElement as HTMLElement, 'admin-payouts-generate')!.click();
    await settle(fixture);

    expect(payouts.generate).toHaveBeenCalledWith('2026-W25');
    expect(text(fixture.nativeElement as HTMLElement, 'admin-payouts-notice')).toBe(
      'Generated 2 batches for 2026-W25.',
    );
  });

  /** The server freezes the batch only at this figure, so it must be the one the admin was shown. */
  it('reports a draft with the total on screen and splices the answer in', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    const host = fixture.nativeElement as HTMLElement;

    byId(host, 'payout-batch-report-11')!.click();
    await settle(fixture);

    expect(payouts.markReported).toHaveBeenCalledWith(11, 9350);
    expect(rowTexts(host)[0]).toContain('Reported');
    expect(text(host, 'admin-payouts-notice')).toBe('Miramar Beach Club is reported at €93.50.');
    expect(document.activeElement).toBe(byId(host, 'admin-payouts-notice'));
  });

  it('on TOTAL_CHANGED re-reads the week and shows the new total, reporting nothing', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    const host = fixture.nativeElement as HTMLElement;
    payouts.markReported.mockRejectedValueOnce(conflict('TOTAL_CHANGED'));
    payouts.forPeriod.mockResolvedValueOnce([{ ...DRAFT, totalNetMinor: 7000 }, REPORTED]);

    byId(host, 'payout-batch-report-11')!.click();
    await settle(fixture);
    await settle(fixture);

    expect(payouts.forPeriod).toHaveBeenLastCalledWith('2026-W25');
    expect(rowTexts(host)[0]).toContain('€70');
    expect(rowTexts(host)[0]).toContain('Draft');
    expect(text(host, 'admin-payouts-notice')).toBe(
      'Miramar Beach Club now nets €70, not €93.50: the ledger moved since this week was loaded. ' +
        'Nothing was reported; review the new total.',
    );
    expect(text(host, 'payout-batch-report-11')).toBe('Report at €70 for Miramar Beach Club');
  });

  it('on ILLEGAL_TRANSITION re-reads the week and says where the batch already is', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    const host = fixture.nativeElement as HTMLElement;
    payouts.markReported.mockRejectedValueOnce(conflict('ILLEGAL_TRANSITION'));
    payouts.forPeriod.mockResolvedValueOnce([{ ...DRAFT, status: 'REPORTED' }, REPORTED]);

    byId(host, 'payout-batch-report-11')!.click();
    await settle(fixture);
    await settle(fixture);

    expect(text(host, 'admin-payouts-notice')).toBe(
      'Miramar Beach Club is already reported. Nothing was changed.',
    );
  });

  /** Another admin froze it first at another total: nothing is left to report, so say where it is. */
  it('on TOTAL_CHANGED for a batch already reported elsewhere, says it is reported', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    const host = fixture.nativeElement as HTMLElement;
    payouts.markReported.mockRejectedValueOnce(conflict('TOTAL_CHANGED'));
    payouts.forPeriod.mockResolvedValueOnce([
      { ...DRAFT, totalNetMinor: 7000, status: 'REPORTED' },
      REPORTED,
    ]);

    byId(host, 'payout-batch-report-11')!.click();
    await settle(fixture);
    await settle(fixture);

    expect(text(host, 'admin-payouts-notice')).toBe(
      'Miramar Beach Club is already reported. Nothing was changed.',
    );
  });

  it('keeps the row and says nothing changed on an unexpected failure', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    const host = fixture.nativeElement as HTMLElement;
    payouts.markSettled.mockRejectedValueOnce(new HttpErrorResponse({ status: 502 }));

    byId(host, 'payout-batch-settle-12')!.click();
    await settle(fixture);

    expect(rowTexts(host)[1]).toContain('Reported');
    expect(text(host, 'admin-payouts-notice')).toBe(
      'Something went wrong updating Bora Bora. Nothing was changed.',
    );
  });

  it('settles a reported batch', async () => {
    const payouts = payoutsStub();
    const fixture = await render(payouts);
    const host = fixture.nativeElement as HTMLElement;

    byId(host, 'payout-batch-settle-12')!.click();
    await settle(fixture);

    expect(payouts.markSettled).toHaveBeenCalledWith(12);
    expect(rowTexts(host)[1]).toContain('Settled');
    expect(text(host, 'admin-payouts-notice')).toBe('Bora Bora is settled.');
    expect(document.activeElement).toBe(byId(host, 'admin-payouts-notice'));
  });
});

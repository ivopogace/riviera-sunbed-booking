import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminCommissionsService } from './admin-commissions.service';
import { AdminConsoleStats } from './admin-console-stats';
import { VenueCommissionView } from './admin.model';

function venue(venueId: number, commissionBps: number): VenueCommissionView {
  return {
    venueId,
    name: `Venue ${venueId}`,
    beach: 'Dhërmi',
    commissionBps,
    payoutCurrency: 'EUR',
  };
}

interface Counts {
  pendingCount?: number;
  activeCount?: number;
  suspendedCount?: number;
}

async function render(
  venues: () => Promise<readonly VenueCommissionView[]>,
  counts: Counts = { pendingCount: 2, activeCount: 3, suspendedCount: 1 },
): Promise<ComponentFixture<AdminConsoleStats>> {
  await TestBed.configureTestingModule({
    imports: [AdminConsoleStats],
    providers: [{ provide: AdminCommissionsService, useValue: { venues } }],
  }).compileComponents();
  const fixture = TestBed.createComponent(AdminConsoleStats);
  fixture.componentRef.setInput('pendingCount', counts.pendingCount);
  fixture.componentRef.setInput('activeCount', counts.activeCount);
  fixture.componentRef.setInput('suspendedCount', counts.suspendedCount);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<AdminConsoleStats>, testId: string): string | undefined {
  const el = (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  return el?.textContent?.trim();
}

describe('AdminConsoleStats', () => {
  it('renders the operator counts it is given', async () => {
    const fixture = await render(() => Promise.resolve([venue(1, 1500)]));

    expect(text(fixture, 'admin-stat-pending')).toBe('2');
    expect(text(fixture, 'admin-stat-active')).toBe('3');
    expect(text(fixture, 'admin-stat-suspended')).toBe('1');
  });

  it('counts venues and renders the mean rate', async () => {
    const fixture = await render(() => Promise.resolve([venue(1, 1500), venue(2, 1000)]));

    expect(text(fixture, 'admin-stat-venues')).toBe('2');
    expect(text(fixture, 'admin-stat-mean-rate')).toBe('mean rate 12.5%');
  });

  it('rounds the mean to whole basis points', async () => {
    const fixture = await render(() =>
      Promise.resolve([venue(1, 1500), venue(2, 1000), venue(3, 1000)]),
    );

    expect(text(fixture, 'admin-stat-mean-rate')).toBe('mean rate 11.67%');
  });

  it('names the aggregation so the mean is never read as the platform take rate', async () => {
    const fixture = await render(() => Promise.resolve([venue(1, 1500), venue(2, 1000)]));

    expect(text(fixture, 'admin-stats-mean-note')).toContain('averages venue rates equally');
    expect(text(fixture, 'admin-stats-mean-note')).toContain('where bookings land');
  });

  it('a failed venue read dashes only its own tile', async () => {
    const fixture = await render(() => Promise.reject(new Error('boom')));

    expect(text(fixture, 'admin-stat-venues')).toBe('—');
    expect(text(fixture, 'admin-stat-mean-rate')).toBeUndefined();
    expect(text(fixture, 'admin-stats-mean-note')).toBeUndefined();
    expect(text(fixture, 'admin-stat-pending')).toBe('2');
    expect(text(fixture, 'admin-stat-active')).toBe('3');
    expect(text(fixture, 'admin-stat-suspended')).toBe('1');
  });

  it('unknown counts render a dash, never a zero', async () => {
    const fixture = await render(() => Promise.resolve([venue(1, 1500)]), {});

    expect(text(fixture, 'admin-stat-pending')).toBe('—');
    expect(text(fixture, 'admin-stat-active')).toBe('—');
    expect(text(fixture, 'admin-stat-suspended')).toBe('—');
  });

  it('keeps a real zero distinct from an unknown count', async () => {
    const fixture = await render(() => Promise.resolve([venue(1, 1500)]), {
      pendingCount: 0,
      activeCount: 0,
      suspendedCount: 0,
    });

    expect(text(fixture, 'admin-stat-pending')).toBe('0');
    expect(text(fixture, 'admin-stat-active')).toBe('0');
    expect(text(fixture, 'admin-stat-suspended')).toBe('0');
  });

  it('no venues means a real zero and no mean', async () => {
    const fixture = await render(() => Promise.resolve([]));

    expect(text(fixture, 'admin-stat-venues')).toBe('0');
    expect(text(fixture, 'admin-stat-mean-rate')).toBeUndefined();
    expect(text(fixture, 'admin-stats-mean-note')).toBeUndefined();
  });

  it('is inert — no link, button or focusable tile', async () => {
    const fixture = await render(() => Promise.resolve([venue(1, 1500)]));
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0);
  });

  it('names the strip for assistive tech as a labelled region', async () => {
    const fixture = await render(() => Promise.resolve([venue(1, 1500)]));
    const strip = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="admin-stats"]',
    )!;

    expect(strip.getAttribute('aria-label')).toBe('Platform at a glance');
  });
});

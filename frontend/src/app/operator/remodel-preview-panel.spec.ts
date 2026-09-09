import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { RemodelPreview } from './operator-console.model';
import { RemodelPreviewPanel } from './remodel-preview-panel';

/** A preview with every group populated — the shape the layout editor confirms against. */
export const FULL_PREVIEW: RemodelPreview = {
  moves: [
    {
      bookingId: 7,
      bookingDate: '2026-09-20',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      to: { setId: 5, rowLabel: 'A', positionNo: 7 },
      rowsAway: 0,
      positionsAway: 4,
    },
    {
      bookingId: 8,
      bookingDate: '2026-09-20',
      amount: { minorUnits: 3500, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'A', positionNo: 2 },
      to: { setId: 11, rowLabel: 'B', positionNo: 1 },
      rowsAway: 1,
      positionsAway: 1,
    },
  ],
  refunds: [
    {
      bookingId: 9,
      bookingDate: '2026-09-22',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
    },
  ],
  releases: [
    {
      bookingId: 10,
      bookingDate: '2026-09-22',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'A', positionNo: 2 },
      kind: 'RELEASE',
    },
    {
      bookingId: 11,
      bookingDate: '2026-09-23',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      kind: 'DECLINE',
    },
  ],
  staffHolds: [{ set: { setId: 2, rowLabel: 'A', positionNo: 2 }, dates: ['2026-09-15'] }],
  blocks: [
    {
      bookingId: 12,
      bookingDate: '2026-09-11',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      reason: 'FROZEN',
    },
    {
      bookingId: 13,
      bookingDate: '2026-09-13',
      amount: { minorUnits: 2000, currency: 'EUR' },
      from: { setId: 2, rowLabel: 'A', positionNo: 2 },
      reason: 'NO_MOVE_CANDIDATE',
    },
  ],
  keep: [
    { setId: 1, rowLabel: 'A', positionNo: 3 },
    { setId: 2, rowLabel: 'A', positionNo: 2 },
  ],
};

/** A preview that only moves — the one shape whose confirm proceeds to the save. */
export const MOVES_ONLY_PREVIEW: RemodelPreview = {
  ...FULL_PREVIEW,
  refunds: [],
  releases: [],
  staffHolds: [],
  blocks: [],
  keep: [],
};

describe('RemodelPreviewPanel (#1033)', () => {
  let fixture: ComponentFixture<RemodelPreviewPanel>;
  let host: HTMLElement;

  function render(preview: RemodelPreview): void {
    TestBed.configureTestingModule({
      imports: [RemodelPreviewPanel],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(RemodelPreviewPanel);
    fixture.componentRef.setInput('preview', preview);
    fixture.componentRef.setInput('venueId', 1);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  function byId(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  it('is an alertdialog listing the five groups with set labels, dates, amounts and distances', () => {
    render(FULL_PREVIEW);

    expect(host.getAttribute('role')).toBe('alertdialog');
    expect(host.getAttribute('aria-label')).toBe('Confirm remodel');
    expect(byId('layout-remodel-moves')!.textContent).toMatch(
      /Row A · position 3 → Row A · position 7 · 4 positions along the row · Sun 20 Sept 2026 · €20/,
    );
    expect(byId('layout-remodel-moves')!.textContent).toMatch(/1 row over, 1 position along/);
    expect(byId('layout-remodel-refunds')!.textContent).toMatch(
      /Row A · position 3 · Tue 22 Sept 2026 · €20 refunded in full/,
    );
    expect(byId('layout-remodel-releases')!.textContent).toMatch(/unpaid booking released/);
    expect(byId('layout-remodel-releases')!.textContent).toMatch(/pending request declined/);
    expect(byId('layout-remodel-holds')!.textContent).toMatch(
      /Row A · position 2 · held by staff Tue 15 Sept 2026/,
    );
    expect(byId('layout-remodel-blocks')!.textContent).toMatch(/arrives within the freeze window/);
    expect(byId('layout-remodel-blocks')!.textContent).toMatch(
      /no free set of the same or better tier that day/,
    );
    expect(host.textContent).not.toMatch(/\bcode\b/i);
  });

  it('names the sets to keep and offers Back only when something blocks', () => {
    render(FULL_PREVIEW);

    expect(byId('layout-remodel-keep')!.textContent).toMatch(
      /Keep Row A · position 3 and Row A · position 2 on the map to save/,
    );
    expect(byId('layout-remodel-save')).toBeNull();
    expect(byId('layout-remodel-back')).toBeTruthy();
    expect(byId('layout-remodel-bookings')!.getAttribute('href')).toBe('/operator/1/daily');
  });

  it('offers Save when nothing blocks, hides the empty groups, and emits both outcomes', () => {
    render(MOVES_ONLY_PREVIEW);
    const confirmed = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.cancelled.subscribe(cancelled);

    expect(byId('layout-remodel-keep')).toBeNull();
    expect(byId('layout-remodel-refunds')).toBeNull();
    expect(byId('layout-remodel-blocks')).toBeNull();
    byId('layout-remodel-save')!.click();
    byId('layout-remodel-back')!.click();

    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('focuses its first button on the way in — Save when it can proceed, Back when blocked', async () => {
    render(MOVES_ONLY_PREVIEW);
    await fixture.whenStable();
    expect(document.activeElement).toBe(byId('layout-remodel-save'));

    TestBed.resetTestingModule();
    render(FULL_PREVIEW);
    await fixture.whenStable();
    expect(document.activeElement).toBe(byId('layout-remodel-back'));
  });
});

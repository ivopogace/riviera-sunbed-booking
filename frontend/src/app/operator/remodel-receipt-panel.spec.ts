import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RemodelReceipt } from './operator-console.model';
import { RemodelReceiptPanel } from './remodel-receipt-panel';

/** The receipt of a commit that moved two bookings — the shape the editor shows after Save and move. */
export const RECEIPT: RemodelReceipt = {
  receiptId: 41,
  committedAt: '2026-09-09T13:00:00Z',
  moves: [
    {
      bookingId: 7,
      bookingDate: '2026-09-20',
      from: { setId: 1, rowLabel: 'A', positionNo: 3 },
      to: { setId: 5, rowLabel: 'A', positionNo: 7 },
      rowsAway: 0,
      positionsAway: 4,
    },
    {
      bookingId: 8,
      bookingDate: '2026-09-21',
      from: { setId: 2, rowLabel: 'A', positionNo: 2 },
      to: { setId: 11, rowLabel: 'B', positionNo: 1 },
      rowsAway: 1,
      positionsAway: 1,
    },
  ],
  refunds: [],
  releases: [],
  refundReason: '',
  refundedTotal: null,
};

/** The receipt of a commit that also ended claims it could not move — refund, release, decline. */
export const RECEIPT_WITH_ENDINGS: RemodelReceipt = {
  ...RECEIPT,
  receiptId: 42,
  refunds: [
    {
      bookingId: 9,
      bookingDate: '2026-09-22',
      from: { setId: 3, rowLabel: 'A', positionNo: 1 },
      amount: { minorUnits: 4500, currency: 'EUR' },
    },
  ],
  releases: [
    {
      bookingId: 10,
      bookingDate: '2026-09-23',
      from: { setId: 3, rowLabel: 'A', positionNo: 1 },
      amount: { minorUnits: 2000, currency: 'EUR' },
      kind: 'RELEASE',
    },
    {
      bookingId: 11,
      bookingDate: '2026-09-24',
      from: { setId: 3, rowLabel: 'A', positionNo: 1 },
      amount: { minorUnits: 2000, currency: 'EUR' },
      kind: 'DECLINE',
    },
  ],
  refundReason: 'Re-laying row A for the season',
  refundedTotal: { minorUnits: 4500, currency: 'EUR' },
};

describe('RemodelReceiptPanel (#1034)', () => {
  let fixture: ComponentFixture<RemodelReceiptPanel>;
  let host: HTMLElement;

  function render(receipt: RemodelReceipt): void {
    TestBed.configureTestingModule({ imports: [RemodelReceiptPanel] });
    fixture = TestBed.createComponent(RemodelReceiptPanel);
    fixture.componentRef.setInput('receipt', receipt);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  function byId(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  it('lists the refund, release and decline lines with the reason and total', () => {
    render(RECEIPT_WITH_ENDINGS);

    expect(byId('layout-remodel-receipt-refunds')!.textContent).toMatch(
      /Row A · position 1 · Tue 22 Sept 2026 · €45/,
    );
    expect(host.textContent).toMatch(/Refunded \(1\) · €45 returned/);
    expect(byId('layout-remodel-receipt-reason')!.textContent).toMatch(
      /Reason: Re-laying row A for the season/,
    );
    expect(byId('layout-remodel-receipt-releases')!.textContent).toMatch(/unpaid booking released/);
    expect(byId('layout-remodel-receipt-releases')!.textContent).toMatch(
      /pending request declined/,
    );
    expect(host.textContent).not.toMatch(/\bcode\b/i);
  });

  it('shows no refund block and no reason when the commit refunded nobody', () => {
    render(RECEIPT);

    expect(byId('layout-remodel-receipt-refunds')).toBeNull();
    expect(byId('layout-remodel-receipt-releases')).toBeNull();
    expect(byId('layout-remodel-receipt-reason')).toBeNull();
    expect(host.textContent).not.toMatch(/returned/);
  });

  it('is a region named by its heading, saying when the layout was saved in Tirane time and what moved', () => {
    render(RECEIPT);

    expect(host.getAttribute('role')).toBe('region');
    expect(host.getAttribute('aria-labelledby')).toBe('layout-remodel-receipt-title');
    const title = byId('layout-remodel-receipt-title')!;
    expect(title.id).toBe('layout-remodel-receipt-title');
    expect(title.getAttribute('tabindex')).toBe('-1');
    expect(title.textContent).toContain('Remodel saved · receipt #41');
    expect(host.textContent).toMatch(/Saved Wed, 9 Sept, 15:00 · 2 bookings moved/);
    const moves = byId('layout-remodel-receipt-moves')!;
    expect(moves.querySelectorAll('li')).toHaveLength(2);
    expect(moves.textContent).toMatch(
      /Row A · position 3 → Row A · position 7 · 4 positions along the row · Sun 20 Sept 2026/,
    );
    expect(moves.textContent).toMatch(
      /Row A · position 2 → Row B · position 1 · 1 row over, 1 position along · Mon 21 Sept 2026/,
    );
    expect(host.textContent).not.toMatch(/\bcode\b/i);
  });

  it('singularises one move and says so when nothing moved', () => {
    render({ ...RECEIPT, moves: [RECEIPT.moves[0]] });
    expect(host.textContent).toMatch(/1 booking moved/);
    fixture.destroy();
    TestBed.resetTestingModule();

    render({ ...RECEIPT, moves: [] });
    expect(host.textContent).toMatch(/0 bookings moved/);
    expect(byId('layout-remodel-receipt-moves')!.textContent).toMatch(/No booking was moved/);
  });

  it('Done emits closed', () => {
    render(RECEIPT);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    byId('layout-remodel-receipt-close')!.click();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});

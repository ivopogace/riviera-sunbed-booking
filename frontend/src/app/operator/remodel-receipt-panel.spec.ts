import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RemodelReceipt } from './operator-console.model';
import { RECEIPT, RECEIPT_WITH_ENDINGS, RECEIPT_WITH_KEPT } from './remodel-receipt-panel.fixtures';
import { RemodelReceiptPanel } from './remodel-receipt-panel';

describe('RemodelReceiptPanel (#1034, #1199)', () => {
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

  it('lists the kept lines with their reason and counts them in the summary (#1199)', () => {
    render(RECEIPT_WITH_KEPT);

    expect(host.textContent).toMatch(/2 bookings moved, 2 kept in place/);
    const kept = byId('layout-remodel-receipt-kept')!;
    expect(kept.querySelectorAll('li')).toHaveLength(2);
    expect(host.textContent).toMatch(/Kept in place \(2\)/);
    expect(kept.textContent).toMatch(
      /Row A · position 3 · Fri 11 Sept 2026 · arrives within the freeze window/,
    );
    expect(kept.textContent).toMatch(
      /Row A · position 2 · Sun 13 Sept 2026 · no free set of the same or better tier that day/,
    );
    expect(host.textContent).not.toMatch(/\bcode\b/i);
  });

  it('shows the fee charged per refunded booking and the total', () => {
    render(RECEIPT_WITH_ENDINGS);

    expect(byId('layout-remodel-receipt-fee')!.textContent).toMatch(
      /Venue-change fee: €5 per refunded booking, €5 in total/,
    );
  });

  it('shows no refund block, no reason and no fee when the commit refunded nobody', () => {
    render(RECEIPT);

    expect(byId('layout-remodel-receipt-refunds')).toBeNull();
    expect(byId('layout-remodel-receipt-releases')).toBeNull();
    expect(byId('layout-remodel-receipt-reason')).toBeNull();
    expect(byId('layout-remodel-receipt-fee')).toBeNull();
    expect(byId('layout-remodel-receipt-kept')).toBeNull();
    expect(host.textContent).not.toMatch(/kept/);
    expect(host.textContent).not.toMatch(/returned/);
    expect(host.textContent).not.toMatch(/fee/i);
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

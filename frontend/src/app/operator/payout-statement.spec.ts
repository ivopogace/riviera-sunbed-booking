import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LedgerRow } from './operator-console.model';
import { PayoutStatement } from './payout-statement';

/**
 * The payout-statement modal — display-only. Lists the SAME ledger rows the tab passes in and
 * the server's total due (no money computed here), shows the "assigned at settlement" transfer
 * placeholder (payout details not stored, reconciliation #4), and emits `dismissed` on Close / ESC /
 * backdrop click (accessible modal, mirroring BookingDialog).
 */
describe('PayoutStatement (#173)', () => {
  let fixture: ComponentFixture<PayoutStatement>;
  let host: HTMLElement;

  const ROWS: LedgerRow[] = [
    {
      bookingId: 11,
      ref: '#11',
      dateLabel: '1 Jul 2026',
      isReversal: false,
      reasonLabel: null,
      grossStr: '€45',
      commissionStr: '€6.75',
      netStr: '€38.25',
      netClass: 'text-riv-console-accent-ink',
    },
    {
      bookingId: 12,
      ref: '#12',
      dateLabel: '2 Jul 2026',
      isReversal: true,
      reasonLabel: 'Weather',
      grossStr: '€25',
      commissionStr: '€3.75',
      netStr: '-€21.25',
      netClass: 'text-[#a3372a]',
    },
  ];

  function render(rows: LedgerRow[] = ROWS, owed = '€17', currency = 'EUR'): void {
    TestBed.configureTestingModule({ imports: [PayoutStatement] });
    fixture = TestBed.createComponent(PayoutStatement);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('owed', owed);
    fixture.componentRef.setInput('currency', currency);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  function byId(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  it('is an accessible dialog listing the rows, the total due, and the settlement placeholder', () => {
    render();
    const dialog = byId('payout-statement')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('#11');
    expect(dialog.textContent).toContain('#12');
    expect(dialog.textContent).toContain('Weather'); // reversal reason
    expect(byId('statement-total')?.textContent).toContain('€17'); // server total due
    expect(dialog.textContent).toContain('Assigned at settlement'); // IBAN + reference placeholder
    expect(dialog.textContent).toContain('EUR');
  });

  it('emits dismissed when the Close button is clicked', () => {
    render();
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed += 1));
    byId('statement-close')!.click();
    expect(dismissed).toBe(1);
  });

  it('emits dismissed on a backdrop click but NOT on a click inside the panel', () => {
    render();
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed += 1));

    // A click inside the panel is stopped from reaching the backdrop host.
    byId('payout-statement')!.click();
    expect(dismissed).toBe(0);

    // A click on the backdrop host itself dismisses.
    host.click();
    expect(dismissed).toBe(1);
  });
});

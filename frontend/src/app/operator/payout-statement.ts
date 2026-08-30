import { afterNextRender, Component, ElementRef, inject, input, output } from '@angular/core';

import { TouchTarget } from '../shared/touch-target';
import { trapFocusWithin } from '../shared/focus-trap';
import { LedgerRow } from './operator-console.model';

/**
 * The payout **statement** modal — a **display-only** view of the ledger for the manual
 * BKT batch (invariant #9: the ledger is the auditable record of what is owed). It formats the SAME
 * {@link LedgerRow}s the tab shows and the SERVER's total due ({@link owed}); it computes no money and
 * moves none. The bank beneficiary/IBAN/reference are shown as an <em>"assigned at settlement"</em>
 * placeholder — venue payout details aren't stored yet and the payout currency is provisional
 * (reconciliation #4). Actual settlement is the manual bank transfer, out of app.
 *
 * <p>Accessible modal, mirroring {@code BookingDialog}: the host is the backdrop (click / ESC dismiss),
 * the panel is `role="dialog"` + `aria-modal`, focus moves in on open and is trapped (WCAG 2.4.3 /
 * 2.1.2, shared {@link trapFocusWithin}). On dismiss the parent must return focus to the trigger —
 * re-rendering it does not focus it.
 */
@Component({
  selector: 'app-payout-statement',
  imports: [TouchTarget],
  host: {
    class:
      'fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#061e28]/45 px-5 py-8',
    '(click)': 'dismissed.emit()',
    '(keydown.escape)': 'dismissed.emit()',
  },
  template: `
    <div
      class="w-full max-w-[600px] overflow-hidden rounded-[24px] bg-white shadow-[0_40px_90px_rgba(6,30,40,0.5)]"
      role="dialog"
      aria-modal="true"
      aria-label="Payout statement"
      data-testid="payout-statement"
      (click)="$event.stopPropagation()"
      (keydown.tab)="trapFocus($event, false)"
      (keydown.shift.tab)="trapFocus($event, true)"
    >
      <div class="flex items-center justify-between gap-3 border-b border-[#0c2a33]/10 px-6 py-4">
        <span class="text-[13px] font-semibold text-riv-card-ink-soft">Payout statement</span>
        <button
          type="button"
          appTouchTarget
          class="rounded-full border border-[#0c2a33]/14 bg-[#0c2a33]/5 px-3.5 py-1.5 text-[13px] font-semibold text-riv-accent-ink"
          data-testid="statement-close"
          (click)="dismissed.emit()"
        >
          Close
        </button>
      </div>
      <div class="px-7 py-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span class="text-[17px] font-bold text-riv-card-ink">Riviera</span>
            <p class="mt-2 text-[12.5px] leading-[1.5] text-riv-card-ink-soft">
              Bank-transfer payout statement
            </p>
          </div>
          <div class="text-right text-[12.5px] leading-[1.6] text-riv-card-ink-soft">
            <div class="text-[14px] font-bold text-riv-card-ink">Your venue</div>
            <div>Current period</div>
            <div>Currency {{ currency() }}</div>
          </div>
        </div>

        <div class="mt-5 overflow-x-auto rounded-[14px] border border-[#0c2a33]/12">
          <table class="w-full border-collapse text-[12.5px]">
            <caption class="sr-only">
              Statement entries
            </caption>
            <thead>
              <tr
                class="bg-[#0c2a33]/4 text-[10.5px] uppercase tracking-[0.06em] text-riv-card-ink-soft"
              >
                <th scope="col" class="px-3.5 py-2.5 text-left font-bold">Date</th>
                <th scope="col" class="px-3.5 py-2.5 text-left font-bold">Booking</th>
                <th scope="col" class="px-3.5 py-2.5 text-right font-bold">Commission</th>
                <th scope="col" class="px-3.5 py-2.5 text-right font-bold">Net</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track $index) {
                <tr class="border-t border-[#0c2a33]/7">
                  <td class="whitespace-nowrap px-3.5 py-2.5 text-riv-card-ink-soft">
                    {{ row.dateLabel }}
                  </td>
                  <td class="px-3.5 py-2.5">
                    <strong class="tracking-[0.03em] text-riv-card-ink">{{ row.ref }}</strong>
                    @if (row.reasonLabel) {
                      <span class="text-riv-card-ink-soft"> {{ row.reasonLabel }}</span>
                    }
                  </td>
                  <td class="whitespace-nowrap px-3.5 py-2.5 text-right text-riv-card-ink-soft">
                    {{ row.commissionStr }}
                  </td>
                  <td
                    class="whitespace-nowrap px-3.5 py-2.5 text-right font-semibold"
                    [class]="row.netClass"
                  >
                    {{ row.netStr }}
                  </td>
                </tr>
              }
              <tr class="border-t-2 border-[#0c2a33]/14 bg-[#2bb8d4]/6">
                <td class="px-3.5 py-3"></td>
                <td class="px-3.5 py-3 font-bold text-riv-card-ink">Total due</td>
                <td class="px-3.5 py-3"></td>
                <td
                  class="whitespace-nowrap px-3.5 py-3 text-right text-[15px] font-bold text-[#0a6e85]"
                  data-testid="statement-total"
                >
                  {{ owed() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          class="mt-4 rounded-[14px] border border-dashed border-[#0c2a33]/20 bg-[#0c2a33]/4 px-4 py-3.5"
        >
          <span class="text-[10.5px] font-bold uppercase tracking-[0.08em] text-riv-card-ink-faint"
            >Transfer to</span
          >
          <div class="mt-1.5 flex justify-between gap-3 text-[13px]">
            <span class="text-riv-card-ink-soft">Beneficiary</span
            ><strong class="text-riv-card-ink">Your venue</strong>
          </div>
          <div class="mt-1 flex justify-between gap-3 text-[13px]">
            <span class="text-riv-card-ink-soft">IBAN</span
            ><strong class="text-riv-card-ink">Assigned at settlement</strong>
          </div>
          <div class="mt-1 flex justify-between gap-3 text-[13px]">
            <span class="text-riv-card-ink-soft">Reference</span
            ><strong class="text-riv-card-ink">Assigned at settlement</strong>
          </div>
        </div>
        <p class="mt-3.5 text-[11.5px] leading-[1.5] text-riv-card-ink-faint">
          Payouts are batched and settled manually by bank transfer at period end. Refund reversals
          are netted into the total above. Amounts in {{ currency() }}.
        </p>
      </div>
    </div>
  `,
})
export class PayoutStatement {
  /** The ledger rows to list — the SAME presentational rows the tab renders (no money re-computation). */
  readonly rows = input.required<readonly LedgerRow[]>();
  /** The server-authoritative total due (formatted `netOwedMinor`, invariant #9). */
  readonly owed = input.required<string>();
  /** The ledger's ISO currency (EUR collection currency, invariant #5). */
  readonly currency = input.required<string>();
  /** Emitted on close (Close button, ESC, or backdrop click) — the parent hides the modal. */
  readonly dismissed = output<void>();

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // Move focus into the modal when it opens (modal a11y) — the Close button is always present.
    afterNextRender({
      earlyRead: () =>
        this.hostRef.nativeElement.querySelector<HTMLElement>('[data-testid="statement-close"]'),
      write: (close) => close?.focus(),
    });
  }

  /** Keep keyboard focus inside the dialog (WCAG 2.4.3 / 2.1.2) — shared trap, see {@link trapFocusWithin}. */
  protected trapFocus(event: Event, backwards: boolean): void {
    trapFocusWithin(this.hostRef.nativeElement, event, backwards);
  }
}

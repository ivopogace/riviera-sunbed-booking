import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { RemodelReceipt } from './operator-console.model';
import { RemodelReceiptPanel } from './remodel-receipt-panel';
import { RECEIPT, RECEIPT_WITH_ENDINGS } from './remodel-receipt-panel.spec';

/**
 * Structural a11y audit for the remodel receipt: a labelled `region`, a heading, one list and a real
 * `<button>`. axe runs over a receipt with moves, one without, and one whose refund, release and
 * decline lines each carry their own sub-heading. (Colour contrast is proven by
 * `remodel-receipt-panel.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('RemodelReceiptPanel a11y (#1034)', () => {
  let fixture: ComponentFixture<RemodelReceiptPanel>;

  function render(receipt: RemodelReceipt): HTMLElement {
    TestBed.configureTestingModule({ imports: [RemodelReceiptPanel] });
    fixture = TestBed.createComponent(RemodelReceiptPanel);
    fixture.componentRef.setInput('receipt', receipt);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no axe violations with moves listed', async () => {
    await expectNoAxeViolations(render(RECEIPT));
  });

  it('has no axe violations when nothing moved', async () => {
    await expectNoAxeViolations(render({ ...RECEIPT, moves: [] }));
  });

  it('has no axe violations with the refund, release and decline lines', async () => {
    await expectNoAxeViolations(render(RECEIPT_WITH_ENDINGS));
  });
});

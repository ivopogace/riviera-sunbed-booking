import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { RemodelPreview } from './operator-console.model';
import { RemodelPreviewPanel } from './remodel-preview-panel';
import { FULL_PREVIEW, MOVES_ONLY_PREVIEW, REFUNDING_PREVIEW } from './remodel-preview-panel.spec';

/**
 * Structural a11y audit for the remodel preview: an `alertdialog` with a name, headed lists per
 * group, real `<button>`s and one link. axe runs over the blocked shape (Back only), the
 * confirmable shape (Save + Back) and the shape that refunds guests, whose two labelled fields and
 * their `role="alert"` errors are the only controls here that take input. (Colour contrast is
 * proven by
 * `remodel-preview-panel.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('RemodelPreviewPanel a11y (#1033)', () => {
  let fixture: ComponentFixture<RemodelPreviewPanel>;

  function render(preview: RemodelPreview): HTMLElement {
    TestBed.configureTestingModule({
      imports: [RemodelPreviewPanel],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(RemodelPreviewPanel);
    fixture.componentRef.setInput('preview', preview);
    fixture.componentRef.setInput('venueId', 1);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no axe violations when something blocks the save', async () => {
    await expectNoAxeViolations(render(FULL_PREVIEW));
  });

  it('has no axe violations when the save can proceed', async () => {
    await expectNoAxeViolations(render(MOVES_ONLY_PREVIEW));
  });

  it('has no axe violations with the refund confirmation showing, before and after its errors', async () => {
    const host = render(REFUNDING_PREVIEW);
    await expectNoAxeViolations(host);

    const count = host.querySelector<HTMLInputElement>(
      '[data-testid="layout-remodel-refund-count"]',
    )!;
    count.value = '9';
    count.dispatchEvent(new Event('input'));
    count.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    await expectNoAxeViolations(host);
  });
});

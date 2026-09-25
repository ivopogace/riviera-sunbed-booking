import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { formatMoney } from '../shared/money';
import { RemodelPreview } from './operator-console.model';
import {
  BLOCKS_ONLY_PREVIEW,
  FULL_PREVIEW,
  HELD_PREVIEW,
  MOVES_ONLY_PREVIEW,
  REFUNDING_PREVIEW,
} from './remodel-preview-panel.fixtures';
import { RemodelPreviewPanel } from './remodel-preview-panel';

describe('RemodelPreviewPanel (#1033, #1034, #1199)', () => {
  let fixture: ComponentFixture<RemodelPreviewPanel>;
  let host: HTMLElement;

  function render(
    preview: RemodelPreview,
    inputs: { stale?: boolean; committing?: boolean } = {},
  ): void {
    TestBed.configureTestingModule({
      imports: [RemodelPreviewPanel],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(RemodelPreviewPanel);
    fixture.componentRef.setInput('preview', preview);
    fixture.componentRef.setInput('venueId', 1);
    fixture.componentRef.setInput('stale', inputs.stale ?? false);
    fixture.componentRef.setInput('committing', inputs.committing ?? false);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  function byId(id: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function type(id: string, value: string): void {
    const field = byId(id) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  it('arms Save only once the refund count and reason are typed, and carries both', () => {
    render(REFUNDING_PREVIEW);
    const committed = vi.fn();
    fixture.componentInstance.committed.subscribe(committed);
    const save = byId('layout-remodel-commit') as HTMLButtonElement;

    expect(save.textContent).toMatch(/Save and move 2, refund 1, release 2 bookings/);
    expect(save.disabled).toBe(true);
    save.click();
    expect(committed).not.toHaveBeenCalled();

    type('layout-remodel-refund-count', '2');
    expect(byId('layout-remodel-refund-count-error')!.textContent).toMatch(
      /Type 1 to confirm the refunds/,
    );
    expect(save.disabled).toBe(true);

    type('layout-remodel-refund-count', '1');
    expect(byId('layout-remodel-refund-count-error')).toBeNull();
    expect(save.disabled).toBe(true);

    type('layout-remodel-reason', '   ');
    expect(byId('layout-remodel-reason-error')!.textContent).toMatch(/Give a reason/);
    expect(save.disabled).toBe(true);

    type('layout-remodel-reason', '  Re-laying row A  ');
    expect(save.disabled).toBe(false);
    save.click();

    expect(committed).toHaveBeenCalledWith({ refundCount: 1, refundReason: 'Re-laying row A' });
  });

  it('asks for no confirmation when the picture refunds nobody', () => {
    render(MOVES_ONLY_PREVIEW);
    const committed = vi.fn();
    fixture.componentInstance.committed.subscribe(committed);

    expect(byId('layout-remodel-confirm')).toBeNull();
    (byId('layout-remodel-commit') as HTMLButtonElement).click();

    expect(committed).toHaveBeenCalledWith({ refundCount: 0, refundReason: '' });
  });

  it('focuses the refund count when there is one to fill in, and the error names its field', async () => {
    render(REFUNDING_PREVIEW);
    await fixture.whenStable();

    expect(document.activeElement).toBe(byId('layout-remodel-refund-count'));

    type('layout-remodel-refund-count', '9');
    const field = byId('layout-remodel-refund-count')!;
    const error = byId('layout-remodel-refund-count-error')!;
    expect(field.getAttribute('aria-describedby')).toContain(error.id);
    expect(field.getAttribute('aria-invalid')).toBe('true');
  });

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

  it('states the venue-change fee per refunded booking and the total', () => {
    render(FULL_PREVIEW);

    const fee = byId('layout-remodel-fee')!.textContent ?? '';
    expect(fee).toContain(formatMoney({ minorUnits: 500, currency: 'EUR' }));
    expect(fee).toMatch(/per refunded booking/i);
    expect(fee).toMatch(/deducted from your payout/i);
  });

  it('a staff hold names the sets to keep, links the bookings tab, and offers Back only', () => {
    render(HELD_PREVIEW);
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    expect(host.textContent).toMatch(
      /Staff hold sets this save removes, so it can’t be saved as painted/,
    );
    expect(byId('layout-remodel-keep')!.textContent).toMatch(
      /Keep Row A · position 2 on the map to save/,
    );
    expect(byId('layout-remodel-bookings')!.getAttribute('href')).toBe('/operator/1/daily');
    expect(host.querySelectorAll('button')).toHaveLength(1);
    byId('layout-remodel-back')!.click();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('a picture with blocks alone is committable and says the sets stay (#1199)', () => {
    render(BLOCKS_ONLY_PREVIEW);
    const committed = vi.fn();
    fixture.componentInstance.committed.subscribe(committed);

    expect(host.textContent).not.toMatch(/can’t be saved as painted/);
    expect(host.textContent).toMatch(
      /2 bookings can’t be moved or ended yet, so their sets stay on the map exactly as they are/,
    );
    expect(byId('layout-remodel-keep')!.textContent).toMatch(
      /Row A · position 3 and Row A · position 2 stay on the map/,
    );
    expect(byId('layout-remodel-blocks')!.textContent).toMatch(/Will stay put \(2\)/);
    expect(byId('layout-remodel-blocks')!.textContent).toMatch(/arrives within the freeze window/);
    expect(byId('layout-remodel-confirm')).toBeNull();
    expect(byId('layout-remodel-commit')!.textContent).toContain('Save and keep 2 bookings');
    byId('layout-remodel-commit')!.click();
    expect(committed).toHaveBeenCalledWith({ refundCount: 0, refundReason: '' });
  });

  it('a picture that moves and keeps counts both in the Save label and needs no confirmation', () => {
    render({ ...BLOCKS_ONLY_PREVIEW, moves: FULL_PREVIEW.moves, blocks: [FULL_PREVIEW.blocks[0]] });

    expect(host.textContent).toMatch(/1 booking can’t be moved or ended yet, so its set stays/);
    expect(byId('layout-remodel-commit')!.textContent).toContain(
      'Save and move 2, keep 1 bookings',
    );
    expect(byId('layout-remodel-confirm')).toBeNull();
  });

  it('a moves-only picture hides the empty groups and offers Save and move, which emits committed (#1034)', () => {
    render(MOVES_ONLY_PREVIEW);
    const committed = vi.fn();
    fixture.componentInstance.committed.subscribe(committed);

    expect(byId('layout-remodel-refunds')).toBeNull();
    expect(byId('layout-remodel-blocks')).toBeNull();
    expect(byId('layout-remodel-holds')).toBeNull();
    expect(byId('layout-remodel-keep')).toBeNull();
    expect(host.textContent).not.toMatch(/can’t be saved as painted/);
    expect(host.textContent).toMatch(/cancel for a full refund/);
    expect(host.textContent).toMatch(/There is no undo/);
    expect(byId('layout-remodel-commit')!.textContent).toContain('Save and move 2 bookings');
    expect(byId('layout-remodel-stale')!.textContent?.trim()).toBe('');
    byId('layout-remodel-commit')!.click();
    expect(committed).toHaveBeenCalledTimes(1);
  });

  it('singularises the Save label and keeps Back beside it', () => {
    render({ ...MOVES_ONLY_PREVIEW, moves: [MOVES_ONLY_PREVIEW.moves[0]] });
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    expect(byId('layout-remodel-commit')!.textContent).toContain('Save and move 1 booking');
    expect(host.querySelectorAll('button')).toHaveLength(2);
    byId('layout-remodel-back')!.click();
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('while committing, Save reads Saving… and both buttons are busy, never disabled (RV-FE-9)', () => {
    render(MOVES_ONLY_PREVIEW, { committing: true });
    const committed = vi.fn();
    fixture.componentInstance.committed.subscribe(committed);

    expect(byId('layout-remodel-commit')!.textContent).toContain('Saving…');
    expect(byId('layout-remodel-commit')!.getAttribute('aria-disabled')).toBe('true');
    expect(byId('layout-remodel-commit')!.hasAttribute('disabled')).toBe(false);
    expect(byId('layout-remodel-back')!.getAttribute('aria-disabled')).toBe('true');
    byId('layout-remodel-commit')!.click();
    expect(committed).not.toHaveBeenCalled();
  });

  it('a stale picture announces that the bookings changed, in a status region that outlives its text, above the fresh groups', () => {
    render(MOVES_ONLY_PREVIEW);
    // The live region exists (empty) before the change, so its later text is announced (RV-FE-10).
    const note = byId('layout-remodel-stale')!;
    expect(note.tagName).toBe('OUTPUT');
    expect(note.textContent?.trim()).toBe('');
    fixture.componentRef.setInput('stale', true);
    fixture.detectChanges();
    expect(note.textContent).toMatch(/bookings changed since you previewed/);
    expect(note.compareDocumentPosition(byId('layout-remodel-moves')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(byId('layout-remodel-commit')).toBeTruthy();
  });

  it('a stale picture that is no longer committable offers Back alone', () => {
    render(FULL_PREVIEW, { stale: true });

    expect(byId('layout-remodel-stale')).toBeTruthy();
    expect(byId('layout-remodel-commit')).toBeNull();
    expect(host.querySelectorAll('button')).toHaveLength(1);
  });

  it('focuses the first button on the way in — Save when committable, Back otherwise', async () => {
    render(MOVES_ONLY_PREVIEW);
    await fixture.whenStable();
    expect(document.activeElement).toBe(byId('layout-remodel-commit'));
    fixture.destroy();
    TestBed.resetTestingModule();

    render(FULL_PREVIEW);
    await fixture.whenStable();
    expect(document.activeElement).toBe(byId('layout-remodel-back'));
  });
});

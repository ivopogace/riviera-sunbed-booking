import { TestBed } from '@angular/core/testing';

import { SEMANTIC_CHIP } from '../../testing/chip-fills';
import { AA_NORMAL, contrastRatio } from '../../testing/contrast';
import { ClosedForSeasonChip } from './closed-for-season-chip';

/**
 * The closed-for-season chip paints exactly the semantic-chip pair — white ink on the opaque brand
 * fill — whose AA proof is `semantic-chip.contrast.spec.ts`. This spec ties the chip to that pair
 * by its classes, so a chip restyled off the family would fail here rather than silently lose the
 * proof.
 */
describe('ClosedForSeasonChip contrast (WCAG AA)', () => {
  it('paints the proven semantic-chip ink/fill pair', () => {
    const fixture = TestBed.createComponent(ClosedForSeasonChip);
    fixture.componentRef.setInput('reopensOn', '2027-05-15');
    fixture.detectChanges();
    const chip = (fixture.nativeElement as HTMLElement).querySelector('.closed-for-season-chip')!;
    expect(SEMANTIC_CHIP.fillClass).toBeDefined();
    expect(chip.classList.contains(SEMANTIC_CHIP.fillClass ?? '')).toBe(true);
    expect(chip.classList.contains('text-white')).toBe(true);
    expect(contrastRatio(SEMANTIC_CHIP.ink, SEMANTIC_CHIP.fill)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

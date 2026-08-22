import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SEMANTIC_CHIP } from '../../testing/chip-fills';
import { SemanticChip } from './semantic-chip';

@Component({
  imports: [SemanticChip],
  template: `
    <span appSemanticChip data-testid="bare">New</span>
    <span appSemanticChip class="px-[11px] py-[5px] text-[11px]" data-testid="sited"
      >Instant Book</span
    >
  `,
})
class Host {}

describe('SemanticChip', () => {
  /** The chip with no utilities of its own — its class list IS the directive's contribution. */
  function chip(): HTMLElement {
    return rendered('bare');
  }

  function rendered(testId: string): HTMLElement {
    const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`)!;
  }

  it('emits the .semantic-chip marker and the inverted accent recipe', () => {
    const element = chip();
    expect(element.classList.contains('semantic-chip')).toBe(true);
    expect(element.classList.contains(`bg-[${SEMANTIC_CHIP.fill}]`)).toBe(true);
    expect(element.classList.contains('font-bold')).toBe(true);
    // The ink is Tailwind's named `text-white`, so the mirror is tied to it by this equality rather than by class interpolation — without it, changing the recipe's ink would leave both contrast proofs asserting a colour that no longer ships.
    expect(element.classList.contains('text-white')).toBe(true);
    expect(SEMANTIC_CHIP.ink).toBe('#ffffff');
  });

  it('the fill is opaque, so no cover photo can reach the ink', () => {
    // The Discover mode chip sits over an arbitrary uploaded photo. An rgba fill would put that photo back into the contrast argument the opaque fill exists to end (#705).
    const fill = [...chip().classList].find((name) => name.startsWith('bg-['));
    expect(fill).toBe(`bg-[${SEMANTIC_CHIP.fill}]`);
  });

  it('carries no geometry, so each call site keeps its own box', () => {
    // The four call sites differ in padding, font size and positioning; the directive owning any of them would move a box and break the no-layout-shift criterion of #705.
    const emitted = [...chip().classList];
    expect(emitted).not.toContain('inline-flex');
    expect(emitted.filter((name) => /^(p|m)[xytrbl]?-/.test(name))).toEqual([]);
    expect(emitted.filter((name) => name.startsWith('text-['))).toEqual([]);
  });

  it("merges with the call site's own utilities rather than replacing them", () => {
    // In Angular 22 a static `class` on the element and a host `class` merge; the sibling chip directives state the same, and this is what lets the recipe stay geometry-free.
    const element = rendered('sited');
    expect(element.classList.contains('px-[11px]')).toBe(true);
    expect(element.classList.contains('text-[11px]')).toBe(true);
    expect(element.classList.contains('semantic-chip')).toBe(true);
  });
});

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

  it('emits exactly the inverted accent recipe — the whole class list, not a subset', () => {
    // Set equality rather than `contains` checks, so an EXTRA class is a failure too — including a second, translucent background beside the opaque one. It subsumes the class-level halves of the tests below; those are kept because each still carries something this one does not: why the fill must be opaque, why no geometry may appear, and the two equalities that tie the shared mirror to what renders.
    expect([...chip().classList].sort()).toEqual(
      [
        'semantic-chip',
        'rounded-full',
        'border',
        'font-bold',
        `bg-[${SEMANTIC_CHIP.fill}]`,
        'border-[#2f7d92]',
        'text-white',
      ].sort(),
    );
  });

  it('the fill is opaque, so no cover photo can reach the ink', () => {
    // The Discover mode chip sits over an arbitrary uploaded photo. An rgba fill would put that photo back into the contrast argument the opaque fill exists to end (#705).
    const backgrounds = [...chip().classList].filter((name) => name.startsWith('bg-'));
    expect(backgrounds).toEqual([`bg-[${SEMANTIC_CHIP.fill}]`]);
    // A six-digit hex has no alpha channel; `bg-[rgba(…)]` or a `/60` opacity modifier would fail the line above, this one, or both.
    expect(SEMANTIC_CHIP.fill).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('the mirror records the ink the recipe actually renders', () => {
    // `text-white` is a named utility, so the mirror cannot be tied to it by interpolation the way the fill is; this equality is the tie. Without it, changing the ink would leave semantic-chip.contrast.spec.ts proving a pair that no longer ships.
    expect(chip().classList.contains('text-white')).toBe(true);
    expect(SEMANTIC_CHIP.ink).toBe('#ffffff');
  });

  it('carries no geometry, so each call site keeps its own box', () => {
    // The five call sites differ in padding, font size and positioning; the directive owning any of them would move a box and break the no-layout-shift criterion of #705.
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

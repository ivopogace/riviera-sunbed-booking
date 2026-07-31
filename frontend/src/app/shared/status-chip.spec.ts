import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BookingStatus, STATUS_META, metaFor } from './booking-status';
import { StatusChip } from './status-chip';

@Component({
  imports: [StatusChip],
  template: `<span [appStatusChip]="modifier()" data-testid="chip">Status</span>`,
})
class Host {
  readonly modifier = signal('chip--confirmed');
}

describe('StatusChip', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [Host] }));

  function chip(modifier: string): HTMLElement {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.modifier.set(modifier);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="chip"]')!;
  }

  it('keeps the .chip and .chip--* marker classes the specs and e2e query', () => {
    // Nothing queried these in the DOM before #477 — this spec is what makes them a real hook.
    const el = chip('chip--confirmed');
    expect(el.classList.contains('chip')).toBe(true);
    expect(el.classList.contains('chip--confirmed')).toBe(true);
  });

  it('carries the shared pill geometry on every status', () => {
    for (const meta of Object.values(STATUS_META)) {
      const el = chip(meta.chip);
      expect(el.classList.contains('inline-flex'), meta.chip).toBe(true);
      expect(el.classList.contains('rounded-full'), meta.chip).toBe(true);
      expect(el.classList.contains('whitespace-nowrap'), meta.chip).toBe(true);
      expect(el.classList.contains('text-[12px]'), meta.chip).toBe(true);
    }
  });

  it.each([
    ['chip--confirmed', 'text-[#0e6e46]', 'bg-[#d9f2e7]', 'border-[#bfe6d4]'],
    ['chip--pending', 'text-[#8a5410]', 'bg-[#fceed5]', 'border-[#f2dcae]'],
    ['chip--awaiting', 'text-[#0a5e7a]', 'bg-[#d5f1f6]', 'border-[#b6e3ec]'],
    ['chip--declined', 'text-[#8a3a2a]', 'bg-[#f6e5e0]', 'border-[#ecccc2]'],
    ['chip--expired', 'text-[#5a6a72]', 'bg-[#eceeef]', 'border-[#d7dbdd]'],
    ['chip--cancelled', 'text-[#8a3a2a]', 'bg-[#f6e5e0]', 'border-[#ecccc2]'],
    ['chip--completed', 'text-[#0a5e6e]', 'bg-[#e1f5f9]', 'border-[#c4e9ef]'],
    ['chip--no-show', 'text-[#7a4a3a]', 'bg-[#ece6e3]', 'border-[#dcd2cd]'],
    ['chip--withdrawn', 'text-[#5c5470]', 'bg-[#eeecf4]', 'border-[#dcd8e6]'],
  ])('renders the %s solid fill carried over from the retired mixin', (modifier, ink, fill, edge) => {
    // booking-status.contrast.spec.ts proves these pairs are AA; this only pins that they're emitted.
    const el = chip(modifier);
    expect(el.classList.contains(ink)).toBe(true);
    expect(el.classList.contains(fill)).toBe(true);
    expect(el.classList.contains(edge)).toBe(true);
  });

  it('covers every status in the union — a new status cannot ship unstyled', () => {
    const styled = Object.keys(STATUS_META) as BookingStatus[];
    for (const status of styled) {
      const el = chip(STATUS_META[status].chip);
      // Exactly one fill utility, i.e. no status silently falling through to a neighbour's colours.
      expect([...el.classList].filter((c) => c.startsWith('bg-[')), status).toHaveLength(1);
    }
  });

  it('merges with a static class on the consuming element rather than replacing it', () => {
    // #477 measured this: a host `[class]` binding does NOT clobber a static `class`, as was claimed.
    @Component({
      imports: [StatusChip],
      template: `<span class="legacy-marker" [appStatusChip]="'chip--confirmed'" data-testid="c">S</span>`,
    })
    class StaticClassHost {}

    const fixture = TestBed.configureTestingModule({
      imports: [StaticClassHost],
    }).createComponent(StaticClassHost);
    fixture.detectChanges();
    const el = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="c"]')!;

    expect(el.classList.contains('legacy-marker')).toBe(true);
    expect(el.classList.contains('chip--confirmed')).toBe(true);
  });

  it('falls back to the neutral chip for a status this build does not know', () => {
    // FE/BE skew (metaFor's tolerance): a backend state shipped ahead of the FE must still render.
    const el = chip(metaFor('SOME_FUTURE_STATE').chip);
    expect(el.classList.contains('chip--expired')).toBe(true);
    expect(el.classList.contains('bg-[#eceeef]')).toBe(true);
  });
});

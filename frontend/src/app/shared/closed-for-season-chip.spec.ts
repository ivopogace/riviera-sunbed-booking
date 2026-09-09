import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ClosedForSeasonChip } from './closed-for-season-chip';

@Component({
  imports: [ClosedForSeasonChip],
  template: `<app-closed-for-season-chip [reopensOn]="reopensOn()" [variant]="variant()" />`,
})
class HostSpec {
  readonly reopensOn = signal<string | null>(null);
  readonly variant = signal<'card' | 'header'>('card');
}

describe('ClosedForSeasonChip', () => {
  function render(reopensOn: string | null, variant: 'card' | 'header' = 'card') {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.componentInstance.reopensOn.set(reopensOn);
    fixture.componentInstance.variant.set(variant);
    fixture.detectChanges();
    const chip = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.closed-for-season-chip',
    )!;
    return { fixture, chip };
  }

  it('says closed for season, and names the reopen day when one is set', () => {
    expect(render(null).chip.textContent?.trim()).toBe('Closed for season');
    expect(render('2027-05-15').chip.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Closed for season · reopens 15 May',
    );
  });

  it('wears the semantic-chip family skin, so it reads as a platform claim like the mode chip', () => {
    const { chip } = render('2027-05-15');
    expect(chip.classList.contains('semantic-chip')).toBe(true);
    expect(chip.classList.contains('bg-riv-solid-fill-brand')).toBe(true);
    expect(chip.classList.contains('text-white')).toBe(true);
  });

  it('keeps the host out of layout and lets the call site pick the box', () => {
    const { fixture, chip } = render(null, 'header');
    const host = (fixture.nativeElement as HTMLElement).querySelector(
      'app-closed-for-season-chip',
    )!;
    expect(host.classList.contains('contents')).toBe(true);
    expect(chip.classList.contains('text-[0.78rem]')).toBe(true);
    expect(render(null, 'card').chip.classList.contains('text-[11px]')).toBe(true);
  });
});

import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SalesClosedChip } from './sales-closed-chip';

@Component({
  imports: [SalesClosedChip],
  template: `<app-sales-closed-chip />`,
})
class HostSpec {}

describe('SalesClosedChip', () => {
  function render() {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { host, chip: host.querySelector<HTMLElement>('.sales-closed-chip')! };
  }

  it('wears the semantic-chip skin and says sales closed for today', () => {
    const { chip } = render();

    expect(chip.textContent?.trim()).toBe('Sales closed for today');
    expect(chip.classList.contains('semantic-chip')).toBe(true);
    expect(chip.classList.contains('bg-riv-solid-fill-brand')).toBe(true);
    expect(chip.classList.contains('text-[11px]')).toBe(true);
  });

  it('keeps the host out of layout', () => {
    const { host } = render();

    expect(host.querySelector('app-sales-closed-chip')?.classList.contains('contents')).toBe(true);
  });
});

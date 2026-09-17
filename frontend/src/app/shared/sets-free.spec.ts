import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SetsFree } from './sets-free';

@Component({
  imports: [SetsFree],
  template: `<span data-testid="line"><app-sets-free [free]="free()" [total]="total()" /></span>`,
})
class HostSpec {
  readonly free = signal(18);
  readonly total = signal(24);
}

describe('SetsFree', () => {
  function render(free: number, total: number) {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.componentInstance.free.set(free);
    fixture.componentInstance.total.set(total);
    fixture.detectChanges();
    const line = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="line"]',
    )!;
    return { fixture, line };
  }

  it('says how many sets are free, the count in bold', () => {
    const { line } = render(18, 24);

    expect(line.textContent?.replace(/\s+/g, ' ').trim()).toBe('18 of 24 free');
    expect(line.querySelector('strong')?.textContent?.trim()).toBe('18');
    expect(line.querySelector('strong')?.classList.contains('text-riv-card-ink')).toBe(true);
  });

  it('counts a venue with no sets as 0 of 0 free, as the list footer does', () => {
    expect(render(0, 0).line.textContent?.replace(/\s+/g, ' ').trim()).toBe('0 of 0 free');
  });

  it('keeps the host out of layout so the call site owns the box', () => {
    const { fixture } = render(18, 24);
    const host = (fixture.nativeElement as HTMLElement).querySelector('app-sets-free')!;

    expect(host.classList.contains('contents')).toBe(true);
  });
});

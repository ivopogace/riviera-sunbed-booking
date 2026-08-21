import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LoadAnnouncer } from './load-announcer';

@Component({
  imports: [LoadAnnouncer],
  template: `<app-load-announcer
    [loading]="loading()"
    [failed]="failed()"
    loadingLabel="Loading venues…"
    readyLabel="Venues loaded."
  />`,
})
class Host {
  readonly loading = signal(true);
  readonly failed = signal(false);
}

describe('LoadAnnouncer', () => {
  function mount() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      cmp: fixture.componentInstance,
      region: () => host.querySelector('[data-testid="load-announcer"]')!,
      // The template pretty-prints, and whitespace is not meaningful to a screen reader.
      spoken: (el: Element) => el.textContent?.trim(),
    };
  }

  it('keeps the SAME element across loading → loaded, so the text is a mutation of a region already in the DOM', () => {
    // The whole point of #741: a region born holding its text is not announced. Element
    // identity across the transition is the mechanism — and the only part jsdom can prove.
    const { fixture, cmp, region, spoken } = mount();
    const whileLoading = region();
    expect(spoken(whileLoading)).toBe('Loading venues…');

    cmp.loading.set(false);
    fixture.detectChanges();

    expect(region()).toBe(whileLoading);
    expect(spoken(whileLoading)).toBe('Venues loaded.');
  });

  it('says nothing when the load failed — "not loading" is not "loaded"', () => {
    // Four of the eight surfaces can leave the loading state by failing. "Payouts loaded."
    // over a failure panel is worse than the silence this keeps.
    const { fixture, cmp, region, spoken } = mount();

    cmp.failed.set(true);
    cmp.loading.set(false);
    fixture.detectChanges();

    expect(spoken(region())).toBe('');
  });

  it('is a visually-hidden polite status region, not a visible one', () => {
    const region = mount().region();

    expect(region.tagName).toBe('P');
    expect(region.classList.contains('sr-only')).toBe(true);
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('costs no layout, so a call site can mount it anywhere above its loading branch', () => {
    // display:contents on the host + an absolutely-positioned sr-only child: neither becomes
    // a flex or grid item in whatever container the call site drops it into.
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = (fixture.nativeElement as HTMLElement).querySelector('app-load-announcer')!;

    expect(element.classList.contains('contents')).toBe(true);
  });
});

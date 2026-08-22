import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LoadAnnouncer } from './load-announcer';

@Component({
  imports: [LoadAnnouncer],
  template: `<app-load-announcer
    [loading]="loading()"
    [ready]="ready()"
    loadingLabel="Loading venues…"
    readyLabel="Venues loaded."
  />`,
})
class Host {
  readonly loading = signal(true);
  readonly ready = signal(false);
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
    // Identity across the transition is the mechanism — and all jsdom can prove (#741).
    const { fixture, cmp, region, spoken } = mount();
    const whileLoading = region();
    expect(spoken(whileLoading)).toBe('Loading venues…');

    cmp.ready.set(true);
    cmp.loading.set(false);
    fixture.detectChanges();

    expect(region()).toBe(whileLoading);
    expect(spoken(whileLoading)).toBe('Venues loaded.');
  });

  it('says nothing on any exit the call site did not call ready — "not loading" is not "loaded"', () => {
    // Fail-safe: an exit nobody described is silent, not a lie (the three #741's review caught).
    const { fixture, cmp, region, spoken } = mount();

    cmp.loading.set(false);
    fixture.detectChanges();

    expect(spoken(region())).toBe('');
  });

  it('reads a contradiction as still in flight, the safer half', () => {
    const { fixture, cmp, region, spoken } = mount();

    cmp.ready.set(true);
    fixture.detectChanges();

    expect(spoken(region())).toBe('Loading venues…');
  });

  it('is a visually-hidden polite status region, not a visible one', () => {
    const region = mount().region();

    expect(region.tagName).toBe('P');
    expect(region.classList.contains('sr-only')).toBe(true);
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
  });

  it('costs no layout, so a call site can mount it anywhere above its loading branch', () => {
    // display:contents + an sr-only child: neither becomes a flex or grid item.
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = (fixture.nativeElement as HTMLElement).querySelector('app-load-announcer')!;

    expect(element.classList.contains('contents')).toBe(true);
  });
});

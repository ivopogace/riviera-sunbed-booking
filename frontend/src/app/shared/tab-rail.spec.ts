import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Mock } from 'vitest';

import { TAB_RAIL_MATCH, TabRail, TabRailDivider, TabRailTab } from './tab-rail';
import { TouchTarget } from './touch-target';

@Component({ template: '' })
class Blank {}

/** A rail of three routed tabs with one group divider, under a real router. */
@Component({
  imports: [RouterLink, RouterLinkActive, TabRail, TabRailTab, TabRailDivider, TouchTarget],
  template: `
    <nav appTabRail aria-label="Sections" data-testid="rail">
      <a
        appTabRailTab
        appTouchTarget
        routerLink="/a"
        routerLinkActive
        ariaCurrentWhenActive="page"
        [routerLinkActiveOptions]="match"
        data-testid="tab-a"
        >Alpha</a
      >
      <span appTabRailDivider data-testid="divider"></span>
      <a
        appTabRailTab
        appTouchTarget
        routerLink="/b"
        routerLinkActive
        ariaCurrentWhenActive="page"
        [routerLinkActiveOptions]="match"
        data-testid="tab-b"
        >Beta</a
      >
      <a
        appTabRailTab
        appTouchTarget
        routerLink="/c"
        routerLinkActive
        ariaCurrentWhenActive="page"
        [routerLinkActiveOptions]="match"
        data-testid="tab-c"
        >Gamma</a
      >
    </nav>
  `,
})
class RailHost {
  protected readonly match = TAB_RAIL_MATCH;
}

async function renderAt(url: string): Promise<ComponentFixture<RailHost>> {
  await TestBed.configureTestingModule({
    imports: [RailHost],
    providers: [
      provideRouter([
        { path: 'a', component: Blank },
        { path: 'b', component: Blank },
        { path: 'c', component: Blank },
      ]),
    ],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(RailHost);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function byTestId(fixture: ComponentFixture<RailHost>, testId: string): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`)!;
}

function tabs(fixture: ComponentFixture<RailHost>): HTMLElement[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('nav a')];
}

/**
 * The shared tab rail: underlined text tabs on one hairline. The marker is
 * `aria-current="page"` from `routerLinkActive`, matched on the path alone; the rail scrolls
 * sideways with no edge mask; the current tab scrolls itself into view.
 */
describe('TabRail', () => {
  it('marks the current tab with aria-current, and only that one', async () => {
    const fixture = await renderAt('/b');

    expect(byTestId(fixture, 'tab-b').getAttribute('aria-current')).toBe('page');
    expect(byTestId(fixture, 'tab-a').getAttribute('aria-current')).toBeNull();
    expect(byTestId(fixture, 'tab-c').getAttribute('aria-current')).toBeNull();
  });

  it('keeps the tab lit under a query string — the match is path-only', async () => {
    const fixture = await renderAt('/b?variant=2');

    expect(byTestId(fixture, 'tab-b').getAttribute('aria-current')).toBe('page');
    expect(byTestId(fixture, 'tab-a').getAttribute('aria-current')).toBeNull();
  });

  /**
   * The pill recipe (`rounded-full` + a border + horizontal padding) belongs to the read-only
   * chips; a routing control never wears it. `inline-flex` is what makes `appTouchTarget`'s
   * 44px floor live on an `<a>` (`riviera-tailwind` rule 4).
   */
  it('renders every tab as inline-flex text with no pill recipe', async () => {
    const fixture = await renderAt('/a');

    for (const tab of tabs(fixture)) {
      const classes = [...tab.classList];
      expect(classes, tab.textContent).toContain('inline-flex');
      expect(classes, tab.textContent).not.toContain('rounded-full');
      expect(
        classes.some((c) => /^border(-|$)/.test(c)),
        tab.textContent,
      ).toBe(false);
      expect(
        classes.some((c) => /^px-\[?\d/.test(c) && c !== 'px-0.5'),
        tab.textContent,
      ).toBe(false);
    }
  });

  it('scrolls sideways with no edge mask — the cut-off tab is the overflow cue', async () => {
    const fixture = await renderAt('/a');
    const classes = [...byTestId(fixture, 'rail').classList];

    expect(classes).toContain('overflow-x-auto');
    expect(classes.some((c) => c.includes('mask-image'))).toBe(false);
  });

  it('hides a group divider from assistive tech', async () => {
    const fixture = await renderAt('/a');

    expect(byTestId(fixture, 'divider').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('TabRail — the current tab scrolls itself into view', () => {
  let scrollIntoView: Mock<(options?: ScrollIntoViewOptions) => void>;

  beforeEach(() => {
    scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  function scrolledLabels(): string[] {
    return scrollIntoView.mock.contexts.map((el) => (el as HTMLElement).textContent.trim());
  }

  it('scrolls the current tab into view on load, and the newly current one on a switch', async () => {
    const fixture = await renderAt('/b');
    expect(scrolledLabels()).toEqual(['Beta']);

    await TestBed.inject(Router).navigateByUrl('/c');
    await fixture.whenStable();

    expect(scrolledLabels()).toEqual(['Beta', 'Gamma']);
  });
});

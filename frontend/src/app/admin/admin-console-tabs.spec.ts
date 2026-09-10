import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Mock } from 'vitest';

import {
  ADMIN_CONSOLE_GROUP_NAMES,
  ADMIN_CONSOLE_TAB_GROUPS,
  ADMIN_CONSOLE_TAB_ORDER,
  ADMIN_CONSOLE_TABS,
  AdminConsoleTabs,
} from './admin-console-tabs';

/** A host that renders the strip under a real router, so `routerLinkActive` resolves for real. */
@Component({
  imports: [AdminConsoleTabs],
  template: `<app-admin-console-tabs label="Admin console sections" />`,
})
class TabsHost {}

@Component({ template: '' })
class Blank {}

async function renderAt(url: string): Promise<ComponentFixture<TabsHost>> {
  await TestBed.configureTestingModule({
    imports: [TabsHost],
    providers: [
      provideRouter([
        { path: 'admin', component: Blank },
        { path: 'admin/commissions', component: Blank },
        { path: 'admin/email', component: Blank },
        { path: 'admin/refunds', component: Blank },
        { path: 'admin/photos', component: Blank },
        { path: 'admin/reviews', component: Blank },
        { path: 'admin/privacy', component: Blank },
        { path: 'admin/audit', component: Blank },
      ]),
    ],
  }).compileComponents();
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(TabsHost);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function tab(fixture: ComponentFixture<TabsHost>, testId: string): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`)!;
}

/** The rendered tab labels, in DOM order. */
function labels(fixture: ComponentFixture<TabsHost>): string[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('nav a')].map((a) =>
    (a as HTMLElement).textContent.trim(),
  );
}

/** The rail's children in DOM order: a tab's label, or `|` for a group divider. */
function railSequence(fixture: ComponentFixture<TabsHost>): string[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('nav > *')].map((el) =>
    el.tagName === 'A' ? (el as HTMLElement).textContent.trim() : '|',
  );
}

/** The canonical order restricted to the tabs present — what a correctly-ordered strip must equal. */
function canonicalOrderOf(present: readonly string[]): string[] {
  return ADMIN_CONSOLE_TAB_ORDER.filter((label) => present.includes(label));
}

describe('AdminConsoleTabs', () => {
  it('lists the tabs that ship, as deep-linkable routes', async () => {
    const fixture = await renderAt('/admin');

    expect(tab(fixture, 'admin-tab-operators').getAttribute('href')).toBe('/admin');
    expect(tab(fixture, 'admin-tab-email').getAttribute('href')).toBe('/admin/email');
    expect(tab(fixture, 'admin-tab-refunds').getAttribute('href')).toBe('/admin/refunds');
    expect(tab(fixture, 'admin-tab-photos').getAttribute('href')).toBe('/admin/photos');
    expect(tab(fixture, 'admin-tab-reviews').getAttribute('href')).toBe('/admin/reviews');
    expect(tab(fixture, 'admin-tab-audit').getAttribute('href')).toBe('/admin/audit');
  });

  /**
   * The lift has to reach assistive tech, not just sighted users — `aria-current` is what carries it,
   * and it is the only signal a screen reader gets that this pill is the open tab.
   */
  it('marks the open tab with aria-current, and only that one (AC-10)', async () => {
    const fixture = await renderAt('/admin/email');

    expect(tab(fixture, 'admin-tab-email').getAttribute('aria-current')).toBe('page');
    expect(tab(fixture, 'admin-tab-operators').getAttribute('aria-current')).toBeNull();
    expect(tab(fixture, 'admin-tab-refunds').getAttribute('aria-current')).toBeNull();
    expect(tab(fixture, 'admin-tab-photos').getAttribute('aria-current')).toBeNull();
  });

  it('marks the Photos tab as current on /admin/photos (#511)', async () => {
    const fixture = await renderAt('/admin/photos');

    expect(tab(fixture, 'admin-tab-photos').getAttribute('aria-current')).toBe('page');
    expect(tab(fixture, 'admin-tab-operators').getAttribute('aria-current')).toBeNull();
    expect(tab(fixture, 'admin-tab-refunds').getAttribute('aria-current')).toBeNull();
  });

  it('marks the Reviews tab as current on /admin/reviews, and not its Photos neighbour', async () => {
    const fixture = await renderAt('/admin/reviews');

    expect(tab(fixture, 'admin-tab-reviews').getAttribute('aria-current')).toBe('page');
    expect(tab(fixture, 'admin-tab-photos').getAttribute('aria-current')).toBeNull();
    expect(tab(fixture, 'admin-tab-operators').getAttribute('aria-current')).toBeNull();
  });

  it('marks the Audit tab as current on /admin/audit (#507)', async () => {
    const fixture = await renderAt('/admin/audit');

    expect(tab(fixture, 'admin-tab-audit').getAttribute('aria-current')).toBe('page');
    expect(tab(fixture, 'admin-tab-operators').getAttribute('aria-current')).toBeNull();
    expect(tab(fixture, 'admin-tab-photos').getAttribute('aria-current')).toBeNull();
  });

  it('marks the Refunds tab as current on /admin/refunds (#460 AC-3)', async () => {
    const fixture = await renderAt('/admin/refunds');

    expect(tab(fixture, 'admin-tab-refunds').getAttribute('aria-current')).toBe('page');
    expect(tab(fixture, 'admin-tab-operators').getAttribute('aria-current')).toBeNull();
    expect(tab(fixture, 'admin-tab-email').getAttribute('aria-current')).toBeNull();
  });

  /**
   * Exact matching matters here: `/admin` is a prefix of `/admin/email`, so a non-exact
   * `routerLinkActive` would light both pills on the Email tab.
   */
  it('does not light Operators while Email is open', async () => {
    const fixture = await renderAt('/admin/email');

    expect(tab(fixture, 'admin-tab-operators').getAttribute('aria-current')).toBeNull();
    expect(tab(fixture, 'admin-tab-email').getAttribute('aria-current')).toBe('page');
  });

  /**
   * The strip's information architecture is an ORDER rather than a layout: one scrolling rail of
   * at most nine tabs, in the canonical order. Every tab that ships sits in it, so this pins a
   * rule rather than a snapshot — a subset in canonical order passes, which is what lets a new tab
   * join the strip without editing an assertion here.
   */
  it('renders tabs in the canonical console order (Q1, #348)', async () => {
    const rendered = labels(await renderAt('/admin'));

    expect(rendered).toEqual(canonicalOrderOf(rendered));
  });

  /**
   * The amended contract (the console-nav spike's grill, answer 8): grouped by what the admin does —
   * accounts, the two outbox levers, moderation, money, records — with Payouts still a reserved
   * slot. Pinned as a literal because the order is a maintainer decision, not something the code
   * derives.
   */
  it('pins the amended canonical order (#1007)', () => {
    expect([...ADMIN_CONSOLE_TAB_ORDER]).toEqual([
      'Operators',
      'Email',
      'Refunds',
      'Photos',
      'Reviews',
      'Commissions',
      'Venue changes',
      'Payouts',
      'Privacy',
      'Audit',
    ]);
  });

  it('draws a divider at each group boundary and nowhere else (#1007)', async () => {
    const fixture = await renderAt('/admin');

    expect(railSequence(fixture)).toEqual([
      'Operators',
      '|',
      'Email',
      'Refunds',
      '|',
      'Photos',
      'Reviews',
      '|',
      'Commissions',
      'Venue changes',
      '|',
      'Privacy',
      'Audit',
    ]);
    for (const divider of (fixture.nativeElement as HTMLElement).querySelectorAll('nav > span')) {
      expect(divider.getAttribute('aria-hidden')).toBe('true');
    }
  });

  /** The pill recipe is the read-only chips'; a routing control wears the rail's underline instead. */
  it('renders underlined text tabs, no pill recipe (#1007)', async () => {
    const fixture = await renderAt('/admin');
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('nav a');

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const classes = [...link.classList];
      expect(classes, link.textContent).toContain('inline-flex');
      expect(classes, link.textContent).not.toContain('rounded-full');
      expect(
        classes.some((c) => /^border(-|$)/.test(c)),
        link.textContent,
      ).toBe(false);
      expect(
        classes.some((c) => /^px-\[?\d/.test(c) && c !== 'px-0.5'),
        link.textContent,
      ).toBe(false);
    }
  });

  it('keeps the tab lit under a query string — the match is path-only (#1007)', async () => {
    const fixture = await renderAt('/admin/email?resend=1');

    expect(tab(fixture, 'admin-tab-email').getAttribute('aria-current')).toBe('page');
    expect(tab(fixture, 'admin-tab-operators').getAttribute('aria-current')).toBeNull();
  });

  /** The guard above is only worth having if it fails on the mistake it exists to catch. */
  it('rejects a tab appended out of its canonical slot', () => {
    const appendedByShipDate = ['Operators', 'Email', 'Audit', 'Commissions'];

    expect(appendedByShipDate).not.toEqual(canonicalOrderOf(appendedByShipDate));
  });

  /**
   * The phone rail and its More sheet (`console-shell.ts`) read the same table the rail renders:
   * every shipped tab names its glyph, a one-line hint and the group it belongs to, and the group
   * name is the one `ADMIN_CONSOLE_TAB_GROUPS` places it in — so the sheet's headings and the
   * rail's dividers cannot disagree.
   */
  it('describes every shipped tab with a glyph, a hint and its contract group, in canonical order (#1012)', () => {
    expect(ADMIN_CONSOLE_GROUP_NAMES).toHaveLength(ADMIN_CONSOLE_TAB_GROUPS.length);
    const labels = ADMIN_CONSOLE_TABS.map((tab) => tab.label);
    expect(labels).toEqual(canonicalOrderOf(labels));
    for (const tab of ADMIN_CONSOLE_TABS) {
      const groupIndex = ADMIN_CONSOLE_TAB_GROUPS.findIndex((group) =>
        (group as readonly string[]).includes(tab.label),
      );
      expect(groupIndex, tab.label).toBeGreaterThanOrEqual(0);
      expect(tab.group, tab.label).toBe(ADMIN_CONSOLE_GROUP_NAMES[groupIndex]);
      expect(tab.hint.length, tab.label).toBeGreaterThan(0);
      expect(typeof tab.glyph, tab.label).toBe('function');
      expect(tab.path.startsWith('/admin'), tab.label).toBe(true);
    }
  });

  it('is a labelled landmark, so two navs never read alike', async () => {
    const fixture = await renderAt('/admin');

    const nav: HTMLElement = (fixture.nativeElement as HTMLElement).querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Admin console sections');
  });
});

describe('AdminConsoleTabs — active tab scroll-into-view (#983)', () => {
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

  it('scrolls the active tab into view on load', async () => {
    await renderAt('/admin/email');

    expect(scrolledLabels()).toEqual(['Email']);
  });

  it('scrolls the newly active tab into view on a tab switch', async () => {
    const fixture = await renderAt('/admin/email');

    await TestBed.inject(Router).navigateByUrl('/admin/audit');
    await fixture.whenStable();

    expect(scrolledLabels()).toEqual(['Email', 'Audit']);
  });
});

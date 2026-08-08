import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ADMIN_CONSOLE_TAB_ORDER, AdminConsoleTabs } from './admin-console-tabs';

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
        { path: 'admin/email', component: Blank },
        { path: 'admin/refunds', component: Blank },
        { path: 'admin/photos', component: Blank },
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
  return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
}

/** The rendered pill labels, in DOM order. */
function labels(fixture: ComponentFixture<TabsHost>): string[] {
  return [...fixture.nativeElement.querySelectorAll('nav a')].map((a) =>
    (a as HTMLElement).textContent!.trim(),
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

    expect(tab(fixture, 'admin-tab-operators').className).not.toContain('riv-tab-active');
    expect(tab(fixture, 'admin-tab-email').className).toContain('riv-tab-active');
  });

  /**
   * The strip's information architecture is an ORDER rather than a layout: one flat wrapping strip
   * of at most eight tabs, in the canonical order. Every tab that ships sits in it, so this pins a
   * rule rather than a snapshot — a subset in canonical order passes, which is what lets a new tab
   * join the strip without editing an assertion here.
   */
  it('renders tabs in the canonical console order (Q1, #348)', async () => {
    const rendered = labels(await renderAt('/admin'));

    expect(rendered).toEqual(canonicalOrderOf(rendered));
  });

  /** The guard above is only worth having if it fails on the mistake it exists to catch. */
  it('rejects a tab appended out of its canonical slot', async () => {
    const appendedByShipDate = ['Operators', 'Email', 'Audit', 'Commissions'];

    expect(appendedByShipDate).not.toEqual(canonicalOrderOf(appendedByShipDate));
  });

  it('is a labelled landmark, so two navs never read alike', async () => {
    const fixture = await renderAt('/admin');

    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    expect(nav.getAttribute('aria-label')).toBe('Admin console sections');
  });
});

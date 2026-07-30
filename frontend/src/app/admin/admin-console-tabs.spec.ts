import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AdminConsoleTabs } from './admin-console-tabs';

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

describe('AdminConsoleTabs', () => {
  it('lists the tabs that ship, as deep-linkable routes', async () => {
    const fixture = await renderAt('/admin');

    expect(tab(fixture, 'admin-tab-operators').getAttribute('href')).toBe('/admin');
    expect(tab(fixture, 'admin-tab-email').getAttribute('href')).toBe('/admin/email');
  });

  /**
   * The lift has to reach assistive tech, not just sighted users — `aria-current` is what carries it,
   * and it is the only signal a screen reader gets that this pill is the open tab.
   */
  it('marks the open tab with aria-current, and only that one (AC-10)', async () => {
    const fixture = await renderAt('/admin/email');

    expect(tab(fixture, 'admin-tab-email').getAttribute('aria-current')).toBe('page');
    expect(tab(fixture, 'admin-tab-operators').getAttribute('aria-current')).toBeNull();
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

  it('is a labelled landmark, so two navs never read alike', async () => {
    const fixture = await renderAt('/admin');

    const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
    expect(nav.getAttribute('aria-label')).toBe('Admin console sections');
  });
});

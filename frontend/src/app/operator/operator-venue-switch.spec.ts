import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenue, OwnedVenues, OwnedVenuesResult } from '../core/owned-venues';
import { OperatorVenueSwitch } from './operator-venue-switch';

@Component({ template: '' })
class BlankPage {}

const TWO: readonly OwnedVenue[] = [
  { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
  { id: 2, name: 'Sereno', beach: 'Jal' },
];

/**
 * The venue switcher the console shell mounts as the venue-console section. These specs pin
 * its states on the console (a disclosure for two or more owned venues, plain text for one,
 * nothing signed out) and off it (`Your venues` as the same disclosure, or a link to the
 * landing), the popover's contract — `Your venues`, name over beach, the current row marked, every
 * row keeping the section, `Add another venue` at the foot — the five ways it closes and where
 * focus lands on each, and the read it triggers so a deep-linked console is never empty.
 */
const operatorAuth = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(false),
  username: signal<string | undefined>('maria'),
};

const owned = {
  venues: signal<readonly OwnedVenue[] | undefined>(TWO),
  load: vi.fn((): Promise<OwnedVenuesResult> =>
    Promise.resolve({ status: 'loaded', venues: owned.venues() ?? [] }),
  ),
};

@Component({
  imports: [OperatorVenueSwitch],
  template: `<header>
    <app-operator-venue-switch
      [venueId]="venueId()"
      [venueName]="venueName()"
      [section]="section()"
    />
  </header>`,
})
class Host {
  readonly venueId = signal<number | undefined>(1);
  readonly venueName = signal<string | undefined>('Miramar Beach Club');
  readonly section = signal<string | undefined>('daily');
}

describe('OperatorVenueSwitch', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  beforeEach(async () => {
    operatorAuth.signedIn.set(true);
    owned.venues.set(TWO);
    owned.load.mockClear();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'operator', component: BlankPage },
          { path: 'operator/:venueId/daily', component: BlankPage },
          { path: 'operator/:venueId/beach-map', component: BlankPage },
          { path: 'account/operator-password', component: BlankPage },
        ]),
        { provide: OperatorAuth, useValue: operatorAuth },
        { provide: OwnedVenues, useValue: owned },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function title(): HTMLElement | null {
    return el.querySelector<HTMLElement>('[data-testid="oc-venue-title"]');
  }

  function button(): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('button[data-testid="oc-venue-title"]')!;
  }

  function menu(): HTMLElement | null {
    return el.querySelector<HTMLElement>('[data-testid="oc-venue-menu"]');
  }

  function open(): void {
    button().click();
    fixture.detectChanges();
  }

  function rows(): HTMLAnchorElement[] {
    return [...menu()!.querySelectorAll<HTMLAnchorElement>('a')];
  }

  /** A row's visible lines: name over beach, or the foot row's one label. */
  function lines(row: HTMLAnchorElement): string[] {
    const spans = [...row.querySelectorAll('span')].map((span) => span.textContent.trim());
    return spans.length > 0 ? spans : [row.textContent.trim()];
  }

  it('renders the name as a closed disclosure for two owned venues', () => {
    expect(title()?.tagName).toBe('BUTTON');
    expect(button().getAttribute('aria-haspopup')).toBe('true');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(button().textContent).toContain('Miramar Beach Club');
    expect(menu()).toBeNull();
    expect(el.textContent).not.toContain('Your venues');
  });

  it('opens: Your venues, name over beach, the current row marked, every row keeping the section', () => {
    open();

    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(menu()!.textContent).toContain('Your venues');
    expect(rows().map((row) => row.getAttribute('href'))).toEqual([
      '/operator/1/daily',
      '/operator/2/daily',
      '/operator?create=1',
    ]);
    expect(rows().map((row) => lines(row))).toEqual([
      ['Miramar Beach Club', 'Ksamil'],
      ['Sereno', 'Jal'],
      ['Add another venue'],
    ]);
    const current = [...menu()!.querySelectorAll('[aria-current="page"]')];
    expect(current.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Miramar Beach Club'),
    ]);
    expect(
      el.querySelector<HTMLAnchorElement>('[data-testid="oc-venue-add"]')?.getAttribute('href'),
    ).toBe('/operator?create=1');
  });

  it('follows the section input, so the rows link to whatever tab is open', () => {
    fixture.componentInstance.section.set('beach-map');
    fixture.detectChanges();
    open();

    expect(rows()[1].getAttribute('href')).toBe('/operator/2/beach-map');
  });

  it('renders the name as plain text for one owned venue — nothing to switch to, no control', () => {
    owned.venues.set([TWO[0]]);
    fixture.detectChanges();

    expect(title()?.tagName).toBe('SPAN');
    expect(title()?.textContent).toContain('Miramar Beach Club');
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('[aria-haspopup]')).toBeNull();
    expect(menu()).toBeNull();
  });

  it('renders the name as plain text while the list is unknown (before the read, or after a failed one)', () => {
    owned.venues.set(undefined);
    fixture.detectChanges();

    expect(title()?.tagName).toBe('SPAN');
    expect(el.querySelector('button')).toBeNull();
  });

  it('falls back to "Your venue" while the name is still loading', () => {
    fixture.componentInstance.venueName.set(undefined);
    fixture.detectChanges();

    expect(button().textContent).toContain('Your venue');
  });

  it('off the console, reads Your venues and discloses the list, each row landing on that console (#1011)', () => {
    fixture.componentInstance.venueId.set(undefined);
    fixture.componentInstance.venueName.set(undefined);
    fixture.componentInstance.section.set(undefined);
    fixture.detectChanges();

    expect(title()?.tagName).toBe('BUTTON');
    expect(button().textContent).toContain('Your venues');
    open();
    expect(rows().map((row) => row.getAttribute('href'))).toEqual([
      '/operator/1',
      '/operator/2',
      '/operator?create=1',
    ]);
    expect(menu()!.querySelector('[aria-current="page"]')).toBeNull();
  });

  it('off the console with one venue, or an unknown list, Your venues is a link to the landing (#1011)', () => {
    fixture.componentInstance.venueId.set(undefined);
    fixture.componentInstance.section.set(undefined);
    owned.venues.set([TWO[0]]);
    fixture.detectChanges();

    expect(title()?.tagName).toBe('A');
    expect(title()?.getAttribute('href')).toBe('/operator');
    expect(title()?.textContent).toContain('Your venues');
    expect(el.querySelector('button')).toBeNull();

    owned.venues.set(undefined);
    fixture.detectChanges();
    expect(title()?.tagName).toBe('A');
    expect(title()?.getAttribute('href')).toBe('/operator');
  });

  it('renders nothing signed out, and never reads the list', () => {
    operatorAuth.signedIn.set(false);
    owned.load.mockClear();
    fixture.detectChanges();

    expect(title()).toBeNull();
    expect(el.querySelector('header')!.children).toHaveLength(1);
    expect(el.querySelector('app-operator-venue-switch')!.childElementCount).toBe(0);
    expect(owned.load).not.toHaveBeenCalled();
  });

  it('reads the owned list once on mount when signed in — the deep-linked console loads its own', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    expect(owned.load).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and returns focus to the name button', () => {
    open();
    rows()[1].focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button());
  });

  it('ignores Escape while closed — it never steals focus', () => {
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('closes on backdrop click and returns focus to the name button', () => {
    open();

    el.querySelector<HTMLElement>('[data-testid="oc-venue-backdrop"]')!.click();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('closes on row activation, returns focus to the name button, and navigates to the other venue', async () => {
    open();
    const row = rows()[1];
    row.focus();

    row.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button());
    expect(TestBed.inject(Router).url).toBe('/operator/2/daily');
  });

  it('links the foot row to the create state', async () => {
    open();

    el.querySelector<HTMLAnchorElement>('[data-testid="oc-venue-add"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/operator?create=1');
  });

  it('closes when a navigation ends elsewhere, leaving focus where it is', async () => {
    open();
    const elsewhere = document.createElement('button');
    document.body.append(elsewhere);
    elsewhere.focus();

    await TestBed.inject(Router).navigateByUrl('/account/operator-password');
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('closes on a click outside the header, leaving focus where it is', () => {
    open();
    const content = document.createElement('button');
    document.body.append(content);

    content.focus();
    content.click();
    fixture.detectChanges();

    expect(menu()).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(content);
    content.remove();
  });

  it('stays open on a click inside its own popover', () => {
    open();

    menu()!.querySelector<HTMLElement>('p')!.click();
    fixture.detectChanges();

    expect(menu()).not.toBeNull();
  });
});

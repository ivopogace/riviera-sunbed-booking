import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';

import { ConsoleSection, ConsoleShell } from './console-shell';
import { OperatorAuth } from './core/operator-auth';
import { OwnedVenue, OwnedVenues, OwnedVenuesResult } from './core/owned-venues';
import { ConsoleVenueMap } from './operator/console-venue-map';
import { PendingRequestsStore } from './operator/pending-requests-store';
import { VenueMapView } from './shared/venue-views';

@Component({ template: '' })
class BlankPage {}

const TWO: readonly OwnedVenue[] = [
  { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
  { id: 2, name: 'Sereno', beach: 'Jal' },
];

function venueMap(id: number, name: string): VenueMapView {
  return {
    id,
    name,
    beach: 'Ksamil',
    region: 'Albanian Riviera',
    description: 'Loungers on the shore.',
    ratingTenths: 48,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: null,
    sets: [],
  };
}

/**
 * The one shell every operator and admin route wears. These specs pin the section row per
 * section — brand, the venue switcher as the venue-console section, `Admin` for an admin, one
 * chip or `Sign in` — the current marks, the rail per section and the admin gate in front of it,
 * the venue-name read and its reset across a venue switch, the scroll-hide below `sm`, and the
 * sign-out teardown. The app-shell wiring (which route wears it, the porcelain pin) is
 * `app.spec.ts`'s; the switcher's and the chip's own contracts are their specs'.
 */
const operatorAuth = {
  restoring: signal(false),
  signedIn: signal(true),
  isAdmin: signal(true),
  username: signal<string | undefined>('maria'),
  signOut: vi.fn(() => Promise.resolve()),
};

const owned = {
  venues: signal<readonly OwnedVenue[] | undefined>(TWO),
  load: vi.fn((): Promise<OwnedVenuesResult> =>
    Promise.resolve({ status: 'loaded', venues: owned.venues() ?? [] }),
  ),
};

/** The coalesced venue snapshot: a controllable subject per call, so a slow read can be sequenced. */
const venueMapStore = {
  reads: [] as { venueId: number; date: string; subject: Subject<VenueMapView> }[],
  load: vi.fn((venueId: number, date: string) => {
    const subject = new Subject<VenueMapView>();
    venueMapStore.reads.push({ venueId, date, subject });
    return subject.asObservable();
  }),
  reset: vi.fn(),
};

@Component({
  imports: [ConsoleShell],
  template: `<app-console-shell [section]="section()" [venueId]="venueId()" />
    <main tabindex="-1"></main>`,
})
class Host {
  readonly section = signal<ConsoleSection>('venue');
  readonly venueId = signal<number | undefined>(1);
}

describe('ConsoleShell', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  beforeEach(async () => {
    operatorAuth.restoring.set(false);
    operatorAuth.signedIn.set(true);
    operatorAuth.isAdmin.set(true);
    operatorAuth.username.set('maria');
    operatorAuth.signOut.mockClear();
    owned.venues.set(TWO);
    owned.load.mockClear();
    venueMapStore.reads = [];
    venueMapStore.load.mockClear();
    venueMapStore.reset.mockClear();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'operator', component: BlankPage },
          { path: 'operator/:venueId/daily', component: BlankPage },
          { path: 'operator/:venueId/beach-map', component: BlankPage },
          { path: 'admin', component: BlankPage },
          { path: 'admin/audit', component: BlankPage },
          { path: 'account/sign-in', component: BlankPage },
          { path: 'account/operator-password', component: BlankPage },
        ]),
        { provide: OperatorAuth, useValue: operatorAuth },
        { provide: OwnedVenues, useValue: owned },
        { provide: ConsoleVenueMap, useValue: venueMapStore },
      ],
    }).compileComponents();
    TestBed.inject(PendingRequestsStore).reset();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  });

  function byId(id: string): HTMLElement | null {
    return el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function header(): HTMLElement {
    return byId('oc-header')!;
  }

  function venueSlot(): HTMLElement {
    return byId('oc-section-venue')!;
  }

  function railLinks(label: string): HTMLAnchorElement[] {
    return [...el.querySelectorAll<HTMLAnchorElement>(`nav[aria-label="${label}"] a`)];
  }

  async function setSection(section: ConsoleSection, venueId?: number): Promise<void> {
    fixture.componentInstance.section.set(section);
    fixture.componentInstance.venueId.set(venueId);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Answers the latest venue-map read, then lets the name render. */
  function answerVenue(name: string, venueId = 1): void {
    const read = venueMapStore.reads.at(-1)!;
    read.subject.next(venueMap(venueId, name));
    read.subject.complete();
    fixture.detectChanges();
  }

  it('venue section: brand, the switcher slot, Admin for an admin, the chip and the six-tab rail', () => {
    expect(byId('oc-brand')!.getAttribute('href')).toBe('/operator');
    expect(byId('oc-brand')!.textContent.trim()).toBe('Riviera');
    expect(header().querySelector('nav')!.getAttribute('aria-label')).toBe('Sections');
    expect(venueSlot().querySelector('[data-testid="oc-venue-title"]')).not.toBeNull();
    expect(byId('oc-section-admin')!.getAttribute('href')).toBe('/admin');
    expect(byId('oc-account')!.getAttribute('aria-label')).toBe('Account: maria');
    expect(byId('oc-signin')).toBeNull();
    expect(header().textContent).not.toContain('Signed in as');

    const rail = railLinks('Operator console sections');
    expect(rail.map((a) => a.getAttribute('href'))).toEqual([
      '/operator/1/daily',
      '/operator/1/requests',
      '/operator/1/beach-map',
      '/operator/1/pricing',
      '/operator/1/venue',
      '/operator/1/payouts',
    ]);
    expect(rail.map((a) => a.textContent.trim())).toEqual([
      'Daily view',
      'Requests',
      'Beach map',
      'Pricing',
      'Venue & commodities',
      'Payouts',
    ]);
    expect(el.querySelectorAll('nav[aria-label="Operator console sections"] > span')).toHaveLength(
      2,
    );
  });

  it('renders no Admin section link for a non-admin operator', () => {
    operatorAuth.isAdmin.set(false);
    fixture.detectChanges();

    expect(byId('oc-section-admin')).toBeNull();
    expect(header().querySelector('a[href="/admin"]')).toBeNull();
  });

  it('marks the venue slot current on the venue section only, Admin on admin only', async () => {
    expect(venueSlot().getAttribute('aria-current')).toBe('page');
    expect(byId('oc-section-admin')!.getAttribute('aria-current')).toBeNull();

    await setSection('admin');
    expect(venueSlot().getAttribute('aria-current')).toBeNull();
    expect(byId('oc-section-admin')!.getAttribute('aria-current')).toBe('page');

    await setSection('plain');
    expect(venueSlot().getAttribute('aria-current')).toBeNull();
    expect(byId('oc-section-admin')!.getAttribute('aria-current')).toBeNull();
    expect(el.querySelector('nav[aria-label$="console sections"]')).toBeNull();

    await setSection('venue', undefined);
    expect(venueSlot().getAttribute('aria-current')).toBeNull();
    expect(el.querySelector('nav[aria-label$="console sections"]')).toBeNull();
  });

  it('reads the venue name through the shared snapshot, Your venue until it lands', () => {
    expect(venueMapStore.load).toHaveBeenCalledWith(1, '2026-06-15');
    expect(byId('oc-venue-title')!.textContent).toContain('Your venue');

    answerVenue('Miramar Beach Club');
    expect(byId('oc-venue-title')!.textContent).toContain('Miramar Beach Club');
  });

  it('drops the old name on a venue switch and ignores a superseded read (invariant #13)', async () => {
    answerVenue('Miramar Beach Club');
    await setSection('venue', 2);
    expect(byId('oc-venue-title')!.textContent).toContain('Your venue');
    expect(venueMapStore.load).toHaveBeenLastCalledWith(2, '2026-06-15');

    // Venue 1's read lands late: it must not overwrite venue 2's row.
    venueMapStore.reads[0].subject.next(venueMap(1, 'Miramar Beach Club'));
    fixture.detectChanges();
    expect(byId('oc-venue-title')!.textContent).toContain('Your venue');

    answerVenue('Sereno', 2);
    expect(byId('oc-venue-title')!.textContent).toContain('Sereno');
  });

  it('shows the Requests badge from the shared store, and none at zero', () => {
    expect(byId('oc-requests-badge')).toBeNull();

    TestBed.inject(PendingRequestsStore).seed(3);
    fixture.detectChanges();
    expect(byId('oc-requests-badge')!.textContent.trim()).toBe('3');
  });

  it('hands the open tab to the switcher, so a venue row keeps the section', async () => {
    await TestBed.inject(Router).navigateByUrl('/operator/1/daily');
    fixture.detectChanges();
    byId('oc-venue-title')!.click();
    fixture.detectChanges();

    const rows = [...byId('oc-venue-menu')!.querySelectorAll('a')];
    expect(rows[1].getAttribute('href')).toBe('/operator/2/daily');
  });

  it('admin section: the admin rail renders only past the gate', async () => {
    await setSection('admin');
    expect(railLinks('Admin console sections').map((a) => a.getAttribute('href'))).toContain(
      '/admin/audit',
    );
    expect(el.querySelector('nav[aria-label="Operator console sections"]')).toBeNull();

    operatorAuth.isAdmin.set(false);
    fixture.detectChanges();
    expect(el.querySelector('nav[aria-label="Admin console sections"]')).toBeNull();

    operatorAuth.isAdmin.set(true);
    operatorAuth.restoring.set(true);
    fixture.detectChanges();
    expect(el.querySelector('nav[aria-label="Admin console sections"]')).toBeNull();
    expect(byId('oc-account')).toBeNull();
    expect(byId('oc-signin')).toBeNull();
  });

  it('admin section, signed out: Sign in with returnUrl, no Admin link, no rail, no admin link anywhere', async () => {
    operatorAuth.signedIn.set(false);
    operatorAuth.isAdmin.set(false);
    owned.load.mockClear();
    await TestBed.inject(Router).navigateByUrl('/admin/audit');
    await setSection('admin');

    expect(byId('oc-signin')!.getAttribute('href')).toBe(
      '/account/sign-in?audience=operator&returnUrl=%2Fadmin%2Faudit',
    );
    expect(byId('oc-account')).toBeNull();
    expect(byId('oc-section-admin')).toBeNull();
    expect(byId('oc-venue-title')).toBeNull();
    expect(el.querySelectorAll('a[href^="/admin"]')).toHaveLength(0);
    expect(el.querySelector('nav[aria-label$="console sections"]')).toBeNull();
    expect(owned.load).not.toHaveBeenCalled();
  });

  it('plain section: the switcher reads Your venues and links into the console; no rail', async () => {
    await setSection('plain');

    expect(byId('oc-venue-title')!.textContent).toContain('Your venues');
    expect(byId('oc-venue-title')!.tagName).toBe('BUTTON');
    expect(venueMapStore.load).toHaveBeenCalledTimes(1);
  });

  it('hides the section row on scroll-down past 64px and shows it on scroll-up, below sm only', () => {
    const hidden = () => header().classList.contains('max-sm:-translate-y-full');
    expect(header().classList).toContain('sticky');
    expect(
      el.querySelector('nav[aria-label="Operator console sections"]')!.classList,
    ).not.toContain('sticky');
    expect(hidden()).toBe(false);

    scrollTo(40);
    expect(hidden()).toBe(false);
    scrollTo(200);
    expect(hidden()).toBe(true);
    scrollTo(150);
    expect(hidden()).toBe(false);
    scrollTo(300);
    expect(hidden()).toBe(true);
    scrollTo(0);
    expect(hidden()).toBe(false);

    function scrollTo(y: number): void {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
      window.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
    }
  });

  it('Sign out parks focus on main, signs out, drops the console stores and leaves for the operator sign-in', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.inject(PendingRequestsStore).seed(3);
    byId('oc-account')!.click();
    fixture.detectChanges();
    const signOut = byId('oc-signout')!;
    signOut.focus();

    signOut.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(el.querySelector('main'));
    await fixture.whenStable();

    expect(operatorAuth.signOut).toHaveBeenCalledTimes(1);
    expect(venueMapStore.reset).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(PendingRequestsStore).count()).toBe(0);
    expect(navigate).toHaveBeenCalledWith(['/account/sign-in'], {
      queryParams: { audience: 'operator' },
    });
  });
});

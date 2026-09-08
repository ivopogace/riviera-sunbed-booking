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
          { path: 'operator/:venueId/requests', component: BlankPage },
          { path: 'operator/:venueId/beach-map', component: BlankPage },
          { path: 'operator/:venueId/pricing', component: BlankPage },
          { path: 'operator/:venueId/venue', component: BlankPage },
          { path: 'operator/:venueId/payouts', component: BlankPage },
          { path: 'admin', component: BlankPage },
          { path: 'admin/photos', component: BlankPage },
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

  function phoneRail(): HTMLElement | null {
    return el.querySelector<HTMLElement>('nav[aria-label$="(phone)"]');
  }

  function more(): HTMLButtonElement {
    return byId('oc-more') as HTMLButtonElement;
  }

  async function goTo(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
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
    expect(phoneRail()).toBeNull();
    expect(byId('oc-account')).toBeNull();
    expect(byId('oc-signin')).toBeNull();
  });

  describe('the phone rail (#1012)', () => {
    /** The slots' visible labels, in order: three links, then the More button. */
    function slots(): string[] {
      return [...phoneRail()!.children].map((slot) => slot.textContent.trim());
    }

    function glyphIn(slot: Element): string {
      return slot.querySelector('svg')!.parentElement!.tagName.toLowerCase();
    }

    it('phone rail: three primaries with glyph and label plus More, on both consoles', async () => {
      expect(phoneRail()!.getAttribute('aria-label')).toBe('Operator console sections (phone)');
      expect(phoneRail()!.dataset['testid']).toBe('oc-phone-rail');
      expect(slots()).toEqual(['Daily', 'Requests', 'Beach map', 'More']);
      const links = [...phoneRail()!.querySelectorAll('a')];
      expect(links.map((a) => a.getAttribute('href'))).toEqual([
        '/operator/1/daily',
        '/operator/1/requests',
        '/operator/1/beach-map',
      ]);
      expect([...phoneRail()!.children].map(glyphIn)).toEqual([
        'app-daily-glyph',
        'app-requests-glyph',
        'app-beach-map-glyph',
        'app-more-glyph',
      ]);
      expect(more().tagName).toBe('BUTTON');
      expect(more().getAttribute('aria-expanded')).toBe('false');
      // CSS decides which rail shows: the text rail hides below sm, the phone rail from sm up.
      expect(phoneRail()!.classList).toContain('sm:hidden');
      expect(byId('oc-tabs')!.parentElement!.classList).toContain('max-sm:hidden');

      await setSection('admin');
      expect(phoneRail()!.getAttribute('aria-label')).toBe('Admin console sections (phone)');
      expect(slots()).toEqual(['Operators', 'Email', 'Refunds', 'More']);
      expect([...phoneRail()!.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
        '/admin',
        '/admin/email',
        '/admin/refunds',
      ]);
      expect(el.querySelector('app-admin-console-tabs')!.parentElement!.classList).toContain(
        'max-sm:hidden',
      );

      await setSection('plain');
      expect(phoneRail()).toBeNull();
      await setSection('venue', undefined);
      expect(phoneRail()).toBeNull();
    });

    it("the More slot carries the current secondary's glyph, label and aria-current, else More", async () => {
      await goTo('/operator/1/daily');
      expect(more().textContent.trim()).toBe('More');
      expect(more().getAttribute('aria-current')).toBeNull();
      expect(glyphIn(more())).toBe('app-more-glyph');
      expect(
        phoneRail()!.querySelector('a[href="/operator/1/daily"]')!.getAttribute('aria-current'),
      ).toBe('page');

      await goTo('/operator/1/payouts');
      expect(more().textContent.trim()).toBe('Payouts');
      expect(more().getAttribute('aria-current')).toBe('page');
      expect(glyphIn(more())).toBe('app-payouts-glyph');
      expect(phoneRail()!.querySelectorAll('a[aria-current="page"]')).toHaveLength(0);

      await setSection('admin');
      await goTo('/admin/audit');
      expect(more().textContent.trim()).toBe('Audit');
      expect(more().getAttribute('aria-current')).toBe('page');
      expect(glyphIn(more())).toBe('app-audit-glyph');

      await goTo('/admin');
      expect(more().textContent.trim()).toBe('More');
      expect(more().getAttribute('aria-current')).toBeNull();
      expect(phoneRail()!.querySelector('a[href="/admin"]')!.getAttribute('aria-current')).toBe(
        'page',
      );
    });

    it('the Requests phone slot carries the live badge, and none at zero', () => {
      expect(byId('oc-phone-requests-badge')).toBeNull();

      TestBed.inject(PendingRequestsStore).seed(3);
      fixture.detectChanges();
      const badge = byId('oc-phone-requests-badge')!;
      expect(badge.textContent.trim()).toBe('3');
      expect(badge.closest('a')!.getAttribute('href')).toBe('/operator/1/requests');
    });

    it('the Admin section link leaves the row below sm (#1012)', () => {
      expect(byId('oc-section-admin')!.classList).toContain('max-sm:hidden');
    });

    describe('the More sheet', () => {
      function sheet(): HTMLElement | null {
        return byId('oc-more-sheet');
      }

      function rows(): HTMLAnchorElement[] {
        return [...sheet()!.querySelectorAll('a')];
      }

      function headings(): string[] {
        return [...sheet()!.querySelectorAll('p')].map((p) => p.textContent.trim());
      }

      async function open(): Promise<void> {
        more().click();
        fixture.detectChanges();
        await fixture.whenStable();
      }

      it('the More sheet lists the secondaries grouped with the current row marked, and the cross-console row per console', async () => {
        await goTo('/operator/1/payouts');
        expect(sheet()).toBeNull();
        await open();

        expect(sheet()!.getAttribute('aria-label')).toBe('More (phone)');
        expect(more().getAttribute('aria-expanded')).toBe('true');
        expect(headings()).toEqual(['Set-up', 'Money', 'Platform']);
        expect(rows().map((a) => a.getAttribute('href'))).toEqual([
          '/operator/1/pricing',
          '/operator/1/venue',
          '/operator/1/payouts',
          '/admin',
        ]);
        expect(
          rows().map((a) => a.querySelector('svg')!.parentElement!.tagName.toLowerCase()),
        ).toEqual(['app-pricing-glyph', 'app-venue-glyph', 'app-payouts-glyph', 'app-admin-glyph']);
        expect(rows()[1].textContent).toContain('Venue & commodities');
        expect(rows()[1].textContent).toContain('Details, amenities, photos');
        expect(rows()[3].textContent).toContain('Admin console');
        expect(rows().map((a) => a.getAttribute('aria-current'))).toEqual([
          null,
          null,
          'page',
          null,
        ]);
        // Nothing in the sheet is a primary: those already have a slot.
        expect(sheet()!.querySelector('a[href="/operator/1/daily"]')).toBeNull();

        // A non-admin has no other console to cross to.
        operatorAuth.isAdmin.set(false);
        fixture.detectChanges();
        expect(headings()).toEqual(['Set-up', 'Money']);
        expect(sheet()!.querySelector('a[href="/admin"]')).toBeNull();
        operatorAuth.isAdmin.set(true);

        await setSection('admin');
        await goTo('/admin/audit');
        await open();
        expect(headings()).toEqual(['Moderation', 'Money', 'Records', 'Operator']);
        expect(rows().map((a) => a.getAttribute('href'))).toEqual([
          '/admin/photos',
          '/admin/reviews',
          '/admin/commissions',
          '/admin/privacy',
          '/admin/audit',
          '/operator',
        ]);
        expect(rows().at(-1)!.textContent).toContain('Your venues');
        expect(rows()[4].getAttribute('aria-current')).toBe('page');
        expect(rows()[3].getAttribute('aria-current')).toBeNull();
      });

      it('opening More focuses the first row; Escape, the backdrop and a row hand focus back to More', async () => {
        await goTo('/operator/1/daily');
        await open();
        expect(document.activeElement).toBe(rows()[0]);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        fixture.detectChanges();
        expect(sheet()).toBeNull();
        expect(more().getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(more());

        await open();
        byId('oc-more-backdrop')!.click();
        fixture.detectChanges();
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(more());

        await open();
        rows()[2].click();
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(TestBed.inject(Router).url).toBe('/operator/1/payouts');
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(more());
        expect(more().textContent.trim()).toBe('Payouts');
      });

      it('a navigation that ends while a row holds focus closes the sheet and lands focus on More; one that ends with focus elsewhere leaves focus alone', async () => {
        await goTo('/operator/1/daily');
        await open();
        expect(document.activeElement).toBe(rows()[0]);

        // Back / Forward while a row is focused: the row unmounts, so focus goes to the persistent More button.
        await goTo('/operator/1/pricing');
        await fixture.whenStable();
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(more());

        await open();
        byId('oc-brand')!.focus();
        await goTo('/operator/1/daily');
        await fixture.whenStable();
        expect(sheet()).toBeNull();
        expect(document.activeElement).toBe(byId('oc-brand'));
      });

      it('a navigation that leaves the console while a row holds focus lands focus on main', async () => {
        await goTo('/operator/1/daily');
        await open();
        expect(document.activeElement).toBe(rows()[0]);

        fixture.componentInstance.section.set('plain');
        fixture.componentInstance.venueId.set(undefined);
        await goTo('/operator');
        await fixture.whenStable();
        expect(sheet()).toBeNull();
        expect(more()).toBeNull();
        expect(document.activeElement).toBe(el.querySelector('main'));
      });
    });
  });

  describe('the ⌘K palette (#1013)', () => {
    function search(): HTMLButtonElement | null {
      return byId('oc-search') as HTMLButtonElement | null;
    }

    function dialog(): HTMLElement | null {
      return el.querySelector<HTMLElement>('[role="dialog"][aria-label="Go to"]');
    }

    function rows(): HTMLAnchorElement[] {
      return [...el.querySelectorAll<HTMLAnchorElement>('[data-testid="oc-palette-row"]')];
    }

    function labels(): string[] {
      return rows().map((row) => row.querySelector('span > span')!.textContent.trim());
    }

    function currentLabels(): string[] {
      return rows()
        .filter((row) => row.getAttribute('aria-current') === 'page')
        .map((row) => row.querySelector('span > span')!.textContent.trim());
    }

    function chord(init: KeyboardEventInit): void {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...init }),
      );
    }

    async function settle(): Promise<void> {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    async function open(): Promise<void> {
      search()!.click();
      await settle();
    }

    it('the search button opens the palette onto its field; ⌘K and Ctrl-K toggle it (#1013)', async () => {
      expect(search()!.tagName).toBe('BUTTON');
      expect(search()!.getAttribute('aria-label')).toBe('Jump to a section or venue (⌘K)');
      expect(search()!.getAttribute('aria-expanded')).toBe('false');
      expect(search()!.classList).toContain('max-sm:hidden');
      expect(header().contains(search())).toBe(true);
      expect(search()!.querySelector('svg')!.parentElement!.tagName.toLowerCase()).toBe(
        'app-search-glyph',
      );
      expect(dialog()).toBeNull();

      await open();
      expect(dialog()!.getAttribute('aria-modal')).toBe('true');
      expect(search()!.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(byId('oc-palette-search'));
      // The dialog is a sibling of the header, never inside its filtered box (which would pin it).
      expect(header().contains(dialog())).toBe(false);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();
      expect(dialog()).toBeNull();
      expect(search()!.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(search());

      chord({ metaKey: true });
      await settle();
      expect(dialog()).not.toBeNull();
      chord({ metaKey: true });
      await settle();
      expect(dialog()).toBeNull();
      chord({ ctrlKey: true });
      await settle();
      expect(dialog()).not.toBeNull();
      expect(search()!.getAttribute('aria-expanded')).toBe('true');
    });

    it('the rows per context: sections with the current marked, venues on the current tab, the other console, Change password (#1013)', async () => {
      await goTo('/operator/1/daily');
      await open();
      expect(labels()).toEqual([
        'Daily view',
        'Requests',
        'Beach map',
        'Pricing',
        'Venue & commodities',
        'Payouts',
        'Miramar Beach Club',
        'Sereno',
        'Admin console',
        'Change password',
      ]);
      expect(rows().map((row) => row.getAttribute('href'))).toEqual([
        '/operator/1/daily',
        '/operator/1/requests',
        '/operator/1/beach-map',
        '/operator/1/pricing',
        '/operator/1/venue',
        '/operator/1/payouts',
        '/operator/1/daily',
        '/operator/2/daily',
        '/admin',
        '/account/operator-password',
      ]);
      expect(currentLabels()).toEqual(['Daily view', 'Miramar Beach Club']);
      expect(rows()[0].textContent).toContain('Arrivals, walk-ins, sales close');
      expect(rows()[0].textContent).toContain('Today');
      expect(rows()[7].textContent).toContain('Open Jal');
      expect(rows()[7].textContent).toContain('Venue');
      expect(rows()[8].textContent).toContain('Operators, outboxes, moderation, records');
      expect(rows()[8].textContent).toContain('Platform');
      expect(rows()[9].textContent).toContain('Your operator account');
      expect(rows()[9].textContent).toContain('Account');
      const glyphOf = (row: Element) =>
        row.querySelector('svg')!.parentElement!.tagName.toLowerCase();
      expect([rows()[0], rows()[6], rows()[8], rows()[9]].map(glyphOf)).toEqual([
        'app-daily-glyph',
        'app-venues-glyph',
        'app-admin-glyph',
        'app-privacy-glyph',
      ]);

      // A non-admin has no other console to cross to.
      operatorAuth.isAdmin.set(false);
      await settle();
      expect(labels()).not.toContain('Admin console');
      operatorAuth.isAdmin.set(true);

      // The venue rows keep the open tab (a navigation closes the dialog; it is reopened).
      await goTo('/operator/1/payouts');
      await open();
      expect(currentLabels()).toEqual(['Payouts', 'Miramar Beach Club']);
      expect(rows()[7].getAttribute('href')).toBe('/operator/2/payouts');

      await setSection('admin');
      await goTo('/admin');
      await open();
      expect(labels()).toEqual([
        'Operators',
        'Email',
        'Refunds',
        'Photos',
        'Reviews',
        'Commissions',
        'Privacy',
        'Audit',
        'Miramar Beach Club',
        'Sereno',
        'Change password',
      ]);
      expect(currentLabels()).toEqual(['Operators']);
      expect(
        rows()
          .slice(8, 10)
          .map((row) => row.getAttribute('href')),
      ).toEqual(['/operator/1/daily', '/operator/2/daily']);
      expect(rows()[7].getAttribute('href')).toBe('/admin/audit');
      expect(rows()[7].textContent).toContain('Records');

      await setSection('plain');
      await goTo('/account/operator-password');
      await open();
      expect(labels()).toEqual([
        'Miramar Beach Club',
        'Sereno',
        'Admin console',
        'Change password',
      ]);
      expect(rows()[0].getAttribute('href')).toBe('/operator/1/daily');
      expect(currentLabels()).toEqual(['Change password']);
    });

    it('the Requests row carries the live badge (#1013)', async () => {
      await goTo('/operator/1/daily');
      await open();
      expect(byId('oc-palette-badge')).toBeNull();

      TestBed.inject(PendingRequestsStore).seed(3);
      await settle();
      const badge = byId('oc-palette-badge')!;
      expect(badge.textContent.trim()).toBe('3');
      expect(badge.closest('a')!.getAttribute('href')).toBe('/operator/1/requests');
    });

    it('signed out on an admin URL: no search button and ⌘K opens nothing (#1013)', async () => {
      operatorAuth.signedIn.set(false);
      operatorAuth.isAdmin.set(false);
      await setSection('admin');
      expect(search()).toBeNull();
      expect(el.querySelector('app-console-palette')).toBeNull();
      chord({ metaKey: true });
      await settle();
      expect(dialog()).toBeNull();

      // A signed-in non-admin on an admin URL, and an admin while the session restores: the same.
      operatorAuth.signedIn.set(true);
      await settle();
      expect(search()).toBeNull();
      operatorAuth.isAdmin.set(true);
      operatorAuth.restoring.set(true);
      await settle();
      expect(search()).toBeNull();
      operatorAuth.restoring.set(false);
      await settle();
      expect(search()).not.toBeNull();
    });
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
    expect(phoneRail()).toBeNull();
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

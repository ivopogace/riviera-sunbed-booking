import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { expectNoAxeViolations } from '../testing/axe';
import { ConsoleSection, ConsoleShell } from './console-shell';
import { OperatorAuth } from './core/operator-auth';
import { OwnedVenue, OwnedVenues, OwnedVenuesResult } from './core/owned-venues';
import { ConsoleVenueMap } from './operator/console-venue-map';

const TWO: readonly OwnedVenue[] = [
  { id: 1, name: 'Miramar Beach Club', beach: 'Ksamil' },
  { id: 2, name: 'Sereno', beach: 'Jal' },
];

@Component({
  imports: [ConsoleShell],
  template: `<app-console-shell [section]="section()" [venueId]="venueId()" />`,
})
class Host {
  readonly section = signal<ConsoleSection>('venue');
  readonly venueId = signal<number | undefined>(1);
}

/**
 * Structural a11y audit for the console shell: the three sections signed in as an admin (the
 * section row, both rails), the chip and the venue popover opened onto every row, and the
 * signed-out admin URL (the `Sign in` row, no rail).
 */
describe('ConsoleShell a11y', () => {
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
      Promise.resolve({ status: 'loaded', venues: TWO }),
    ),
  };
  const venueMap = {
    load: vi.fn(() => of({ id: 1, name: 'Miramar Beach Club', sets: [] })),
    reset: vi.fn(),
  };

  async function render(section: ConsoleSection, signedIn = true): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    operatorAuth.signedIn.set(signedIn);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: OperatorAuth, useValue: operatorAuth },
        { provide: OwnedVenues, useValue: owned },
        { provide: ConsoleVenueMap, useValue: venueMap },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.section.set(section);
    fixture.componentInstance.venueId.set(section === 'venue' ? 1 : undefined);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  async function open(el: HTMLElement, id: string): Promise<void> {
    el.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('has no violations on the venue console as an admin', async () => {
    await expectNoAxeViolations(await render('venue'));
  });

  it('has no violations with the account popover open', async () => {
    const el = await render('venue');
    await open(el, 'oc-account');
    expect(el.querySelector('[data-testid="oc-account-menu"]')).not.toBeNull();
    await expectNoAxeViolations(el);
  });

  it('has no violations with the venue popover open', async () => {
    const el = await render('venue');
    await open(el, 'oc-venue-title');
    expect(el.querySelector('[data-testid="oc-venue-menu"]')).not.toBeNull();
    await expectNoAxeViolations(el);
  });

  it('has no violations on the admin console', async () => {
    await expectNoAxeViolations(await render('admin'));
  });

  it('is axe clean with the More sheet open on both consoles', async () => {
    for (const section of ['venue', 'admin'] as const) {
      const el = await render(section);
      await open(el, 'oc-more');
      expect(el.querySelector('[data-testid="oc-more-sheet"]')).not.toBeNull();
      await expectNoAxeViolations(el);
    }
  });

  it('is axe clean with the palette open on both consoles (#1013)', async () => {
    for (const section of ['venue', 'admin'] as const) {
      const el = await render(section);
      await open(el, 'oc-search');
      expect(el.querySelector('[role="dialog"][aria-label="Go to"]')).not.toBeNull();
      await expectNoAxeViolations(el);
    }
  });

  it('has no violations on a plain operator page', async () => {
    await expectNoAxeViolations(await render('plain'));
  });

  it('has no violations signed out on an admin URL', async () => {
    await expectNoAxeViolations(await render('admin', false));
  });
});

import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { AuditGlyph, EmailGlyph, PrivacyGlyph, RequestsGlyph, VenuesGlyph } from './console-glyphs';
import { ConsolePalette, PaletteRow } from './console-palette';

@Component({ template: '' })
class BlankPage {}

/** A slice of what the shell lists: two admin tabs, a Requests row with its badge, a venue, the account page. */
const ROWS: readonly PaletteRow[] = [
  {
    key: 's:email',
    glyph: EmailGlyph,
    label: 'Email',
    hint: 'Undelivered mail, resend',
    group: 'Outboxes',
    link: ['/admin/email'],
    current: true,
  },
  {
    key: 's:requests',
    glyph: RequestsGlyph,
    label: 'Requests',
    hint: 'Accept or decline booking requests',
    group: 'Today',
    link: ['/operator', 2, 'requests'],
    current: false,
    badge: 3,
  },
  {
    key: 's:privacy',
    glyph: PrivacyGlyph,
    label: 'Privacy',
    hint: 'Data-subject erasure',
    group: 'Records',
    link: ['/admin/privacy'],
    current: false,
  },
  {
    key: 's:audit',
    glyph: AuditGlyph,
    label: 'Audit',
    hint: 'Every admin action, in order',
    group: 'Records',
    link: ['/admin/audit'],
    current: false,
  },
  {
    key: 'v:2',
    glyph: VenuesGlyph,
    label: 'Aurora Bay',
    hint: 'Open Dhërmi',
    group: 'Venue',
    link: ['/operator', 2, 'daily'],
    current: false,
  },
];

@Component({
  imports: [ConsolePalette],
  template: `
    <button type="button" data-testid="opener" (click)="palette().toggle(opener)" #opener>
      Go to
    </button>
    @if (pageLink()) {
      <a href="#page" data-testid="page-link">A page control</a>
    }
    <app-console-palette [rows]="rows()" />
    <main tabindex="-1"></main>
  `,
})
class Host {
  readonly rows = signal<readonly PaletteRow[]>(ROWS);
  readonly pageLink = signal(true);
  readonly palette = viewChild.required(ConsolePalette);
}

/**
 * The ⌘K palette's own contract, over a fixed row set: the dialog and its field, the filter and the
 * first-hit highlight, Enter, the empty state, the two chords, the focus legs on every close, the
 * modal trap, and a navigation that ends with it open. What the rows ARE per console is the shell's
 * (`console-shell.spec.ts`).
 */
describe('ConsolePalette', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', component: BlankPage },
          { path: 'admin/email', component: BlankPage },
          { path: 'admin/privacy', component: BlankPage },
          { path: 'admin/audit', component: BlankPage },
          { path: 'operator/:venueId/daily', component: BlankPage },
          { path: 'operator/:venueId/requests', component: BlankPage },
        ]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/email');
    fixture.detectChanges();
  });

  function byId(id: string): HTMLElement | null {
    return el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function dialog(): HTMLElement | null {
    return el.querySelector<HTMLElement>('[role="dialog"]');
  }

  function field(): HTMLInputElement {
    return byId('oc-palette-search') as HTMLInputElement;
  }

  function rows(): HTMLAnchorElement[] {
    return [...el.querySelectorAll<HTMLAnchorElement>('[data-testid="oc-palette-row"]')];
  }

  function labels(): string[] {
    return rows().map((row) => row.querySelector('span > span')!.textContent.trim());
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens through the host's button, the way the shell's search glyph does. */
  async function openByButton(): Promise<void> {
    byId('opener')!.click();
    await settle();
  }

  function chord(init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.dispatchEvent(event);
    return event;
  }

  async function type(text: string): Promise<void> {
    field().value = text;
    field().dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function enter(): Promise<void> {
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
  }

  it('opens as a modal dialog named Go to, with the field focused and every row listed in order', async () => {
    expect(dialog()).toBeNull();
    await openByButton();

    expect(dialog()!.getAttribute('aria-label')).toBe('Go to');
    expect(dialog()!.getAttribute('aria-modal')).toBe('true');
    expect(byId('oc-palette-backdrop')!.getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(field());
    expect(field().getAttribute('aria-label')).toBe('Jump to');
    expect(field().getAttribute('placeholder')).toBe('Jump to a section or venue…');
    expect(field().value).toBe('');
    expect(labels()).toEqual(['Email', 'Requests', 'Privacy', 'Audit', 'Aurora Bay']);
    expect(rows().map((row) => row.getAttribute('href'))).toEqual([
      '/admin/email',
      '/operator/2/requests',
      '/admin/privacy',
      '/admin/audit',
      '/operator/2/daily',
    ]);
    expect(rows().map((row) => row.getAttribute('aria-current'))).toEqual([
      'page',
      null,
      null,
      null,
      null,
    ]);
    expect(rows()[0].querySelector('svg')!.parentElement!.tagName.toLowerCase()).toBe(
      'app-email-glyph',
    );
    expect(rows()[0].textContent).toContain('Undelivered mail, resend');
    expect(rows()[0].textContent).toContain('Outboxes');
    // The live Requests count, on its row only.
    expect(byId('oc-palette-badge')!.textContent.trim()).toBe('3');
    expect(byId('oc-palette-badge')!.closest('a')).toBe(rows()[1]);
    // Nothing is highlighted before a query: Enter has no target.
    expect(el.querySelector('[data-hit]')).toBeNull();
  });

  it('typing filters by label, hint and group; the first hit is highlighted and Enter opens it', async () => {
    await openByButton();

    await type('aud');
    expect(labels()).toEqual(['Audit']);
    expect(rows()[0].hasAttribute('data-hit')).toBe(true);

    await type('resend');
    expect(labels()).toEqual(['Email']);

    await type('RECORDS');
    expect(labels()).toEqual(['Privacy', 'Audit']);
    expect(rows().map((row) => row.hasAttribute('data-hit'))).toEqual([true, false]);

    await type('aurora');
    expect(labels()).toEqual(['Aurora Bay']);
    await enter();
    expect(router.url).toBe('/operator/2/daily');
    expect(dialog()).toBeNull();
  });

  it('Nothing matches. for a query with no hit, and Enter does nothing then or on an empty query', async () => {
    await openByButton();

    await enter();
    expect(router.url).toBe('/admin/email');
    expect(dialog()).not.toBeNull();

    await type('zzz');
    expect(rows()).toEqual([]);
    const empty = byId('oc-palette-empty')!;
    expect(empty.textContent.trim()).toBe('Nothing matches.');
    expect(empty.getAttribute('role')).toBe('status');
    await enter();
    expect(router.url).toBe('/admin/email');
    expect(dialog()).not.toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it('⌘K and Ctrl-K toggle it, the default prevented; the query starts empty on every open', async () => {
    const meta = chord({ metaKey: true });
    await settle();
    expect(dialog()).not.toBeNull();
    expect(meta.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field());
    await type('aud');

    chord({ metaKey: true });
    await settle();
    expect(dialog()).toBeNull();

    chord({ ctrlKey: true });
    await settle();
    expect(dialog()).not.toBeNull();
    expect(field().value).toBe('');
    expect(labels()).toHaveLength(5);

    // A bare k, or a shifted one, is typing, not the chord.
    chord({ ctrlKey: true });
    await settle();
    expect(dialog()).toBeNull();
    chord({});
    await settle();
    expect(dialog()).toBeNull();
  });

  it("Escape, the backdrop and a row hand focus back to the opener; the chord's opener is the element focused when it fired", async () => {
    await openByButton();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byId('opener'));

    // Escape while closed steals nothing.
    byId('page-link')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(document.activeElement).toBe(byId('page-link'));

    chord({ metaKey: true });
    await settle();
    expect(document.activeElement).toBe(field());
    byId('oc-palette-backdrop')!.click();
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byId('page-link'));

    chord({ ctrlKey: true });
    await settle();
    rows()[3].click();
    await settle();
    expect(router.url).toBe('/admin/audit');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byId('page-link'));
  });

  it('a navigation that ends with the dialog open closes it; focus lands on the opener, or on main when it is gone', async () => {
    await openByButton();
    expect(document.activeElement).toBe(field());
    await router.navigateByUrl('/admin');
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byId('opener'));

    // The chord's opener unmounts with the page it was on: focus goes to the app shell's main.
    byId('page-link')!.focus();
    chord({ metaKey: true });
    await settle();
    fixture.componentInstance.pageLink.set(false);
    await router.navigateByUrl('/admin/privacy');
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('main'));

    // A navigation that ends with focus outside the dialog closes it and leaves focus alone.
    await openByButton();
    byId('opener')!.focus();
    await router.navigateByUrl('/admin/audit');
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byId('opener'));
  });

  it('a row that is the current page closes the dialog without a navigation, and a later navigation steals no focus', async () => {
    await openByButton();
    rows()[0].click();
    await settle();
    expect(router.url).toBe('/admin/email');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(byId('opener'));

    // The skipped same-URL navigation left nothing pending: an unrelated navigation moves no focus.
    byId('page-link')!.focus();
    await router.navigateByUrl('/admin');
    await settle();
    expect(document.activeElement).toBe(byId('page-link'));
  });

  it('the empty-state status region pre-exists its text, so the change is announced', async () => {
    await openByButton();
    const status = byId('oc-palette-empty')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent.trim()).toBe('');

    await type('zzz');
    expect(byId('oc-palette-empty')).toBe(status);
    expect(status.textContent.trim()).toBe('Nothing matches.');

    await type('aud');
    expect(byId('oc-palette-empty')).toBe(status);
    expect(status.textContent.trim()).toBe('');
  });

  it('traps Tab inside the dialog: from the last row back to the field, Shift+Tab from the field to the last row', async () => {
    await openByButton();
    const last = rows().at(-1)!;
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog()!.dispatchEvent(tab);
    expect(document.activeElement).toBe(field());
    expect(tab.defaultPrevented).toBe(true);

    const back = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dialog()!.dispatchEvent(back);
    expect(document.activeElement).toBe(last);
  });

  it('declares the 44px floor on the field and every row, and keeps the field on the 3px ring', async () => {
    await openByButton();
    expect(field().classList).toContain('min-h-11');
    expect(field().className).toContain('focus-visible:outline-[3px]');
    for (const row of rows()) {
      expect(row.classList).toContain('min-h-11');
      expect(row.classList).toContain('flex');
    }
  });
});

import { ApplicationRef, Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { AuditGlyph, RequestsGlyph, VenuesGlyph } from './console-glyphs';
import { ConsolePalette, PaletteRow } from './console-palette';

const ROWS: readonly PaletteRow[] = [
  {
    key: 's:requests',
    glyph: RequestsGlyph,
    label: 'Requests',
    hint: 'Accept or decline booking requests',
    group: 'Today',
    link: ['/operator', 1, 'requests'],
    current: true,
    badge: 2,
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
    link: ['/operator', 2, 'beach-map'],
    current: false,
  },
];

@Component({
  imports: [ConsolePalette],
  template: `<button type="button" #opener (click)="palette().toggle(opener)">Go to</button>
    <app-console-palette [rows]="rows" />`,
})
class Host {
  readonly rows = ROWS;
  readonly palette = viewChild.required(ConsolePalette);
}

/** Structural a11y audit for the ⌘K palette: the dialog open with rows, a highlighted hit, and the empty state. */
describe('ConsolePalette a11y', () => {
  async function render(query?: string): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('button')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    if (query !== undefined) {
      const field = el.querySelector<HTMLInputElement>('[data-testid="oc-palette-search"]')!;
      field.value = query;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await TestBed.inject(ApplicationRef).whenStable();
    }
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    return el;
  }

  it('has no violations with every row listed', async () => {
    await expectNoAxeViolations(await render());
  });

  it('has no violations with one highlighted hit', async () => {
    const el = await render('aud');
    expect(el.querySelector('[data-hit]')).not.toBeNull();
    await expectNoAxeViolations(el);
  });

  it('has no violations on the empty state', async () => {
    const el = await render('zzz');
    expect(el.querySelector('[data-testid="oc-palette-empty"]')).not.toBeNull();
    await expectNoAxeViolations(el);
  });
});

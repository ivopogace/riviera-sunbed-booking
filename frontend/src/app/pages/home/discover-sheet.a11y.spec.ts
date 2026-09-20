import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../../testing/axe';
import { DiscoverSheet } from './discover-sheet';

/**
 * Automated axe-core audit of the sheet's own chrome — the grabber, the Map pill, the region —
 * with a head and rows projected into it. Colour contrast is proven deterministically in
 * `discover-sheet.contrast.spec.ts`; the rendered geometry in `discover-sheet.e2e.ts`.
 */
@Component({
  imports: [DiscoverSheet],
  template: `
    <app-discover-sheet>
      <div sheetHead><h2>Himarë</h2></div>
      <ul>
        <li>Palasa Sands</li>
        <li>Aurora Bay</li>
      </ul>
    </app-discover-sheet>
  `,
})
class Host {}

describe('DiscoverSheet accessibility', () => {
  async function render(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations at half', async () => {
    const host = await render();
    expect(host.querySelector('[data-testid="sheet-grabber"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('has no serious violations at full, with the Map pill', async () => {
    const host = await render();
    host.querySelector<HTMLButtonElement>('[data-testid="sheet-grabber"]')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(host.querySelector('[data-testid="sheet-map-pill"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });
});

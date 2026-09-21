import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

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
  async function render(): Promise<ComponentFixture<Host>> {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('has no serious violations at half', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="sheet-grabber"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('has no serious violations at full, with the Map pill', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[data-testid="sheet-grabber"]')!.click();
    // The click's signal writes render on the zoneless scheduler's own turn, not the click's.
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="sheet-map-pill"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });
});

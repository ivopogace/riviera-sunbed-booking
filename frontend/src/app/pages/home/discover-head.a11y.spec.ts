import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../../testing/axe';
import { DiscoverHead } from './discover-head';

/**
 * Automated axe-core audit of the sheet's head in the states the page reaches: the row alone,
 * a rail open, the Near me answer standing in the rail slot. Contrast is proven in
 * `discover-head.contrast.spec.ts`.
 */
describe('DiscoverHead accessibility', () => {
  let fixture: ComponentFixture<DiscoverHead>;

  function render(note: string | null): HTMLElement {
    TestBed.configureTestingModule({ imports: [DiscoverHead] });
    fixture = TestBed.createComponent(DiscoverHead);
    fixture.componentRef.setInput('title', 'Himarë');
    fixture.componentRef.setInput('subtitle', '8 of 11 selling today');
    fixture.componentRef.setInput('located', true);
    fixture.componentRef.setInput('beaches', [
      { code: 'PALASE', label: 'Palasë', count: 2 },
      { code: 'DHERMI', label: 'Dhërmi', count: 3 },
    ]);
    fixture.componentRef.setInput('beach', 'DHERMI');
    fixture.componentRef.setInput('spelled', false);
    fixture.componentRef.setInput('today', '2026-06-15');
    fixture.componentRef.setInput('date', '2026-06-15');
    fixture.componentRef.setInput('railsShown', true);
    fixture.componentRef.setInput('note', note);
    fixture.componentRef.setInput('pickerOpen', false);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations as the one row', async () => {
    await expectNoAxeViolations(render(null));
  });

  it('has no serious violations with the beach rail open', async () => {
    const host = render(null);
    host.querySelector<HTMLButtonElement>('[data-testid="head-beaches"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('[role="group"][aria-label="Beach"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });

  it('has no serious violations with the Near me answer in the rail slot', async () => {
    const host = render('You don’t seem to be on the Albanian riviera — the map hasn’t moved.');
    expect(host.querySelector('[data-testid="head-note"]')).not.toBeNull();
    await expectNoAxeViolations(host);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../../testing/axe';
import { CoastPicker } from './coast-picker';

/** Automated axe-core audit of the coast picker dialog with a region and a beach lit. */
describe('CoastPicker accessibility', () => {
  let fixture: ComponentFixture<CoastPicker>;

  function render(beach: string): HTMLElement {
    TestBed.configureTestingModule({ imports: [CoastPicker] });
    fixture = TestBed.createComponent(CoastPicker);
    fixture.componentRef.setInput('regions', [
      {
        code: 'HIMARE',
        label: 'Himarë',
        venues: 2,
        from: '€25',
        beaches: [
          { code: 'PALASE', label: 'Palasë', venues: 1, from: '€26' },
          { code: 'DHERMI', label: 'Dhërmi', venues: 1, from: '€25' },
        ],
      },
    ]);
    fixture.componentRef.setInput('region', 'HIMARE');
    fixture.componentRef.setInput('beach', beach);
    fixture.componentRef.setInput('located', true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations with the region current', async () => {
    await expectNoAxeViolations(render(''));
  });

  it('has no serious violations with a beach current', async () => {
    await expectNoAxeViolations(render('DHERMI'));
  });
});

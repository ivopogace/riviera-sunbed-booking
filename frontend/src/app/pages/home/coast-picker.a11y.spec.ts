import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../../testing/axe';
import { FakeGeolocationGateway } from '../../../testing/fake-geolocation';
import { FakeMapEngine } from '../../shared/fake-map-engine';
import { GeolocationGateway } from '../../shared/geolocation';
import { MapEngine } from '../../shared/map-engine';
import { CoastPicker } from './coast-picker';

/**
 * Automated axe-core audit of the coast picker dialog with a region and a beach lit, the ribbon's
 * map booted — its `aria-hidden` box must hold nothing focusable (axe's `aria-hidden-focus`).
 */
describe('CoastPicker accessibility', () => {
  let fixture: ComponentFixture<CoastPicker>;

  async function render(beach: string): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CoastPicker],
      providers: [
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    });
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
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations with the region current', async () => {
    await expectNoAxeViolations(await render(''));
  });

  it('has no serious violations with a beach current', async () => {
    await expectNoAxeViolations(await render('DHERMI'));
  });
});

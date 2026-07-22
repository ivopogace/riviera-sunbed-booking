import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OwnedVenues, OwnedVenuesResult } from '../core/owned-venues';
import { OperatorHome } from './operator-home';

/**
 * Structural a11y audit for the `/operator` venue picker (S9 #277). Both rendering states are
 * audited: the multi-venue picker (a labelled list of links) and the load-failure card with its
 * retry. The 0- and 1-venue cases render nothing — they navigate away — so there is nothing to audit.
 */
describe('OperatorHome a11y (#277)', () => {
  let fixture: ComponentFixture<OperatorHome>;

  async function render(owned: OwnedVenuesResult): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: OwnedVenues, useValue: { load: () => Promise.resolve(owned) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    fixture = TestBed.createComponent(OperatorHome);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no violations on the multi-venue picker', async () => {
    await expectNoAxeViolations(
      await render({
        status: 'loaded',
        venues: [
          { id: 12, name: 'Miramar Beach Club', beach: 'Dhërmi' },
          { id: 15, name: 'Sereno', beach: 'Jal' },
        ],
      }),
    );
  });

  it('has no violations on the load-failure card', async () => {
    await expectNoAxeViolations(await render({ status: 'error' }));
  });
});

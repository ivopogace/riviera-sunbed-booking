import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { expectNoAxeViolations } from '../../testing/axe';
import { OwnedVenues, OwnedVenuesResult } from '../core/owned-venues';
import { OperatorHome } from './operator-home';

/**
 * Structural a11y audit for the `/operator` home (S9 #277, create state #278). Audited states: the
 * multi-venue picker (a labelled list of links + the Add-another-venue entry), the load-failure card
 * with its retry, and the zero state rendering the create card inline (its form internals are
 * audited by `venue-create-card.a11y.spec.ts`). The 1-venue case renders nothing — it navigates.
 */
describe('OperatorHome a11y (#277/#278)', () => {
  let fixture: ComponentFixture<OperatorHome>;

  async function render(owned: OwnedVenuesResult): Promise<HTMLElement> {
    const paramMap = convertToParamMap({});
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        // The create card (zero state) injects HTTP-backed services.
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OwnedVenues, useValue: { load: () => Promise.resolve(owned) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: paramMap }, queryParamMap: of(paramMap) },
        },
      ],
    });
    fixture = TestBed.createComponent(OperatorHome);
    await fixture.whenStable();
    fixture.detectChanges();
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

  it('has no violations on the zero state with the create card inline (#278)', async () => {
    await expectNoAxeViolations(await render({ status: 'loaded', venues: [] }));
  });
});

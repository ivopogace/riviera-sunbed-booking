import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { VenueNotFound } from './venue-not-found';

/**
 * Automated axe-core audit of the venue-not-found page — the one surface that answers a bad console
 * link. The chrome around it is the console shell's (`console-shell.a11y.spec.ts`). Colour contrast
 * is proven deterministically in `venue-not-found.contrast.spec.ts`; axe cannot measure it in jsdom.
 */
describe('VenueNotFound accessibility (axe)', () => {
  it('has no axe violations on the not-found card', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(VenueNotFound);
    fixture.detectChanges();

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

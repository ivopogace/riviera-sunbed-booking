import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { operatorAuthInterceptor } from '../core/operator-auth.interceptor';
import { VenueEditor } from './venue-editor';

/**
 * Automated axe-core structural audit of the venue editor (issue #38 pattern). Guards the form
 * a11y (labelled inputs, button names, ARIA validity, non-colour state) against regression in the
 * two states the operator drives without a server round-trip. Colour contrast is checked
 * deterministically in `venue-editor.contrast.spec.ts` (axe can't measure contrast under jsdom).
 */
describe('VenueEditor accessibility (axe)', () => {
  let fixture: ComponentFixture<VenueEditor>;
  let auth: OperatorAuth;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueEditor],
      providers: [
        provideHttpClient(withInterceptors([operatorAuthInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueEditor);
    auth = TestBed.inject(OperatorAuth);
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('has no violations in the signed-out sign-in state', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });

  it('has no violations in the signed-in create-venue state', async () => {
    auth.signIn('operator', 'pw');
    fixture.detectChanges();
    await fixture.whenStable();
    await expectNoAxeViolations(host());
  });
});

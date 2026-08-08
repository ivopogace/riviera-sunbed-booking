import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../../testing/axe';
import { TermsOfService } from './terms-of-service';

/** Axe structural audit of the draft terms page — static content, one state. */
describe('TermsOfService accessibility (axe)', () => {
  let fixture: ComponentFixture<TermsOfService>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TermsOfService] }).compileComponents();
    fixture = TestBed.createComponent(TermsOfService);
    await fixture.whenStable();
  });

  it('has no critical/serious violations', async () => {
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

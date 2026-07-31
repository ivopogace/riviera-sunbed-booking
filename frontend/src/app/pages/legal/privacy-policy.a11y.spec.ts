import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../../testing/axe';
import { PrivacyPolicy } from './privacy-policy';

/** Axe structural audit of the draft privacy page (#101 Slice 3) — static content, one state. */
describe('PrivacyPolicy accessibility (axe)', () => {
  let fixture: ComponentFixture<PrivacyPolicy>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PrivacyPolicy] }).compileComponents();
    fixture = TestBed.createComponent(PrivacyPolicy);
    await fixture.whenStable();
  });

  it('has no critical/serious violations', async () => {
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../../testing/axe';
import { ForVenues } from './for-venues';

/** Axe structural audit of the venue-owner page — static content, one state. */
describe('ForVenues accessibility (axe)', () => {
  let fixture: ComponentFixture<ForVenues>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForVenues],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ForVenues);
    await fixture.whenStable();
  });

  it('has no critical/serious violations', async () => {
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

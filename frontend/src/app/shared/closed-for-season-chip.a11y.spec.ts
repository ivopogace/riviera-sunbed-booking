import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { ClosedForSeasonChip } from './closed-for-season-chip';

@Component({
  imports: [ClosedForSeasonChip],
  template: `<main>
    <p class="flex gap-2">
      <app-closed-for-season-chip reopensOn="2027-05-15" />
      <app-closed-for-season-chip [reopensOn]="null" variant="header" />
    </p>
  </main>`,
})
class HostSpec {}

/** The chip is plain text in an inline box: nothing to label, nothing to hide — axe must agree. */
describe('ClosedForSeasonChip a11y', () => {
  it('has no axe violations in either variant', async () => {
    const fixture = TestBed.createComponent(HostSpec);
    fixture.detectChanges();
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

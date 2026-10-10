import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../../testing/axe';
import { PageReload } from '../../core/page-reload';
import { PageLoadFailed } from './page-load-failed';

describe('PageLoadFailed accessibility (axe)', () => {
  it('has no violations', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PageReload, useValue: { to: () => undefined } }],
    });
    const fixture = TestBed.createComponent(PageLoadFailed);
    await fixture.whenStable();
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../../testing/axe';
import { RecordingPageNavigation } from '../../../testing/recording-page-navigation';
import { PageNavigation } from '../../core/page-navigation';
import { PageLoadFailed } from './page-load-failed';

describe('PageLoadFailed accessibility (axe)', () => {
  it('has no violations', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PageNavigation, useValue: new RecordingPageNavigation() },
      ],
    });
    const fixture = TestBed.createComponent(PageLoadFailed);
    await fixture.whenStable();
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

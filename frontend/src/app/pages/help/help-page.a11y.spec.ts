import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { expectNoAxeViolations } from '../../../testing/axe';
import { SupportContact } from '../../core/support-contact';
import { HelpPage } from './help-page';

/** Axe structural audit of the help page with both channels and the in-season promise rendered. */
describe('HelpPage accessibility (axe)', () => {
  it('has no critical/serious violations', async () => {
    TestBed.configureTestingModule({
      imports: [HelpPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(HelpPage);
    await fixture.whenStable();
    TestBed.inject(HttpTestingController)
      .expectOne(`${environment.apiBaseUrl}/api/support-contact`)
      .flush({
        email: 'help@example.com',
        whatsapp: { number: '+355691234567', url: 'https://wa.me/355691234567' },
        sameDayReply: true,
      });
    await TestBed.inject(SupportContact).load();
    await fixture.whenStable();

    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });
});

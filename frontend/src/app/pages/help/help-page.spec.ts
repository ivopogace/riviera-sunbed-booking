import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { SupportContactView } from '../../shared/support-contact-view';
import { SupportContact } from '../../core/support-contact';
import { HelpPage } from './help-page';

const URL = `${environment.apiBaseUrl}/api/support-contact`;

const BOTH: SupportContactView = {
  email: 'help@example.com',
  whatsapp: { number: '+355691234567', url: 'https://wa.me/355691234567' },
  sameDayReply: true,
};

describe('HelpPage', () => {
  let fixture: ComponentFixture<HelpPage>;
  let http: HttpTestingController;

  async function render(contact: SupportContactView | 'error'): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [HelpPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HelpPage);
    await fixture.whenStable();
    const request = http.expectOne(URL);
    if (contact === 'error') {
      request.flush(null, { status: 500, statusText: 'Server Error' });
    } else {
      request.flush(contact);
    }
    await TestBed.inject(SupportContact).load();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  it('explains booking, cancelling and arrival', async () => {
    const host = await render(BOTH);

    expect(host.querySelector('h1')?.textContent).toContain('Help');
    expect(host.querySelector('[data-testid="help-booking"]')?.textContent).toContain(
      'booking code',
    );
    expect(host.querySelector('[data-testid="help-cancellation"]')?.textContent).toContain(
      'refund',
    );
    expect(host.querySelector('[data-testid="help-beach"]')?.textContent).toContain('staff');
  });

  it('names both channels and the same-day promise in season', async () => {
    const host = await render(BOTH);

    const contact = host.querySelector('[data-testid="help-contact"]');
    expect(contact?.querySelector('[data-testid="support-email"]')).not.toBeNull();
    expect(contact?.querySelector('[data-testid="support-whatsapp"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="help-promise"]')?.textContent).toBe(
      'We answer the same day, 08:00–20:00, May to October.',
    );
  });

  it('names the channels with no time promise outside the season', async () => {
    const host = await render({ ...BOTH, sameDayReply: false });

    expect(host.querySelector('[data-testid="support-email"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="help-promise"]')).toBeNull();
    expect(host.textContent).not.toContain('08:00');
  });

  it('renders no contact section when no channel is configured', async () => {
    const host = await render({ email: null, whatsapp: null, sameDayReply: true });

    expect(host.querySelector('[data-testid="help-contact"]')).toBeNull();
    expect(host.textContent).not.toContain('Contact us');
  });

  it('still explains the basics when the contact read fails', async () => {
    const host = await render('error');

    expect(host.querySelector('[data-testid="help-booking"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="help-contact"]')).toBeNull();
  });
});

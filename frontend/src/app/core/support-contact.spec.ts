import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { SupportContactView } from '../shared/support-contact-view';
import { SupportContact } from './support-contact';

const URL = `${environment.apiBaseUrl}/api/support-contact`;

const CONTACT: SupportContactView = {
  email: 'help@example.com',
  whatsapp: { number: '+355691234567', url: 'https://wa.me/355691234567' },
  sameDayReply: true,
};

describe('SupportContact', () => {
  let http: HttpTestingController;
  let service: SupportContact;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(SupportContact);
  });

  afterEach(() => http.verify());

  it('requests nothing until a surface asks', () => {
    http.expectNone(URL);
    expect(service.contact()).toBeUndefined();
  });

  it('loads the channels once and shares the read between callers', async () => {
    const first = service.load();
    const second = service.load();
    http.expectOne({ method: 'GET', url: URL }).flush(CONTACT);
    await Promise.all([first, second]);

    expect(service.contact()).toEqual(CONTACT);
    await service.load();
  });

  it('leaves the contact undefined on a failed read and retries on the next load', async () => {
    const failed = service.load();
    http.expectOne(URL).flush(null, { status: 500, statusText: 'Server Error' });
    await failed;
    expect(service.contact()).toBeUndefined();

    const retried = service.load();
    http.expectOne(URL).flush(CONTACT);
    await retried;
    expect(service.contact()).toEqual(CONTACT);
  });
});

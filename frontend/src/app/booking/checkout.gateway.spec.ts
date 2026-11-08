import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { PageNavigation } from '../core/page-navigation';
import { CheckoutGateway, CheckoutSession, EmbeddedCheckoutGateway } from './checkout.gateway';

const HOST = document.createElement('div');

describe('CheckoutGateway', () => {
  const session: CheckoutSession = { confirm: () => Promise.resolve({}) };
  const mount = vi.fn(() => Promise.resolve(session));
  const leaveTo = vi.fn();

  beforeEach(() => {
    mount.mockClear();
    leaveTo.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: EmbeddedCheckoutGateway, useValue: { mount } },
        { provide: PageNavigation, useValue: { leaveTo, reload: vi.fn() } },
      ],
    });
  });

  it('mounts the embedded form on the instruction token', async () => {
    const started = await TestBed.inject(CheckoutGateway).start(HOST, {
      kind: 'EMBEDDED',
      clientToken: 'tok_1',
      reference: 'ref_1',
    });

    expect(mount).toHaveBeenCalledWith(HOST, 'tok_1');
    expect(started).toBe(session);
  });

  it('leaves for the redirect URL only when the guest confirms it', async () => {
    const url = 'https://pay.example.test/o/1';
    const started = await TestBed.inject(CheckoutGateway).start(HOST, {
      kind: 'REDIRECT',
      url,
      reference: 'ord_1',
    });

    expect(leaveTo).not.toHaveBeenCalled();
    await expect(started.confirm()).resolves.toEqual({ redirecting: true });
    expect(leaveTo).toHaveBeenCalledWith(url);
  });

  it('refuses a redirect that is not https, leaving the page where it is', async () => {
    await expect(
      TestBed.inject(CheckoutGateway).start(HOST, {
        kind: 'REDIRECT',
        url: 'javascript:alert(1)',
        reference: 'ord_1',
      }),
    ).rejects.toThrow('Could not open the payment page');
    expect(leaveTo).not.toHaveBeenCalled();
  });
});

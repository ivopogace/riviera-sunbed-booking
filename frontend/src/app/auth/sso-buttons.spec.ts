import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mock, vi } from 'vitest';

import { CustomerAuth } from '../core/customer-auth';
import { SsoProviderId } from '../core/sso-redirect';
import { SsoButtons } from './sso-buttons';

/** A CustomerAuth stub exposing only startSso — the rest of the service is inert. */
function authStub(): Partial<CustomerAuth> & { startSso: Mock<(provider: SsoProviderId) => void> } {
  return { startSso: vi.fn<(provider: SsoProviderId) => void>() };
}

async function render(auth: Partial<CustomerAuth>): Promise<ComponentFixture<SsoButtons>> {
  await TestBed.configureTestingModule({
    imports: [SsoButtons],
    providers: [{ provide: CustomerAuth, useValue: auth }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SsoButtons);
  fixture.detectChanges();
  return fixture;
}

describe('SsoButtons', () => {
  it('starts SSO for the clicked provider', async () => {
    const auth = authStub();
    const fixture = await render(auth);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('[data-testid="sso-google"]')!.click();
    expect(auth.startSso).toHaveBeenCalledWith('google');

    el.querySelector<HTMLButtonElement>('[data-testid="sso-apple"]')!.click();
    expect(auth.startSso).toHaveBeenCalledWith('apple');
  });
});

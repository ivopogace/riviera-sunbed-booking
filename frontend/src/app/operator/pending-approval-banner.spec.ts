import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { OperatorAuth } from '../core/operator-auth';
import { PendingApprovalBanner } from './pending-approval-banner';

class FakeOperatorAuth {
  readonly pendingApproval = signal(false);
}

describe('PendingApprovalBanner (#694)', () => {
  async function render(pending: boolean): Promise<HTMLElement> {
    const auth = new FakeOperatorAuth();
    auth.pendingApproval.set(pending);
    TestBed.configureTestingModule({
      providers: [{ provide: OperatorAuth, useValue: auth }],
    });
    const fixture = TestBed.createComponent(PendingApprovalBanner);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('tells a PENDING operator its venues are not tourist-visible yet', async () => {
    const host = await render(true);
    const banner = host.querySelector('[data-testid="pending-approval-banner"]');

    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('approv');
    expect(banner?.textContent?.toLowerCase()).toContain('tourists');
  });

  it('announces politely as a status region, not an alert', async () => {
    const host = await render(true);

    expect(
      host.querySelector('[data-testid="pending-approval-banner"]')!.getAttribute('role'),
    ).toBe('status');
  });

  it('renders nothing for an approved operator', async () => {
    const host = await render(false);

    expect(host.querySelector('[data-testid="pending-approval-banner"]')).toBeNull();
  });
});

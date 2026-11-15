import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mock, vi } from 'vitest';

import { CustomerAuth, SsoProviderId } from '../core/customer-auth';
import { OperatorAuth } from '../core/operator-auth';
import { SsoButtons } from './sso-buttons';

type StartSso = Mock<(provider: SsoProviderId) => void>;

async function render(
  audience: 'tourist' | 'operator',
): Promise<{ fixture: ComponentFixture<SsoButtons>; customer: StartSso; operator: StartSso }> {
  const customer: StartSso = vi.fn<(provider: SsoProviderId) => void>();
  const operator: StartSso = vi.fn<(provider: SsoProviderId) => void>();
  await TestBed.configureTestingModule({
    imports: [SsoButtons],
    providers: [
      { provide: CustomerAuth, useValue: { startSso: customer } },
      { provide: OperatorAuth, useValue: { startSso: operator } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(SsoButtons);
  fixture.componentRef.setInput('audience', audience);
  fixture.detectChanges();
  return { fixture, customer, operator };
}

function click(fixture: ComponentFixture<SsoButtons>, testId: string): void {
  (fixture.nativeElement as HTMLElement)
    .querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!
    .click();
}

describe('SsoButtons', () => {
  it('starts the tourist flow for the clicked provider', async () => {
    const { fixture, customer, operator } = await render('tourist');

    click(fixture, 'sso-google');
    click(fixture, 'sso-apple');

    expect(customer.mock.calls).toEqual([['google'], ['apple']]);
    expect(operator).not.toHaveBeenCalled();
  });

  it('starts the operator flow on the operator tab, never the tourist one', async () => {
    const { fixture, customer, operator } = await render('operator');

    click(fixture, 'sso-google');

    expect(operator).toHaveBeenCalledWith('google');
    expect(customer).not.toHaveBeenCalled();
  });
});

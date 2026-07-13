import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { CustomerAuth } from '../core/customer-auth';
import { Register } from './register';

/**
 * Structural axe audit of the customer registration page (S2 #111, AC-11): a titled region with
 * labelled email + password inputs (the password carries a described-by hint), a submit control, and
 * an error alert. Contrast is not measurable by axe under jsdom; real focus is proven in the e2e.
 */
const authStub: Partial<CustomerAuth> = { register: async () => 'error' };

async function render(): Promise<ComponentFixture<Register>> {
  await TestBed.configureTestingModule({
    imports: [Register],
    providers: [provideRouter([]), { provide: CustomerAuth, useValue: authStub }],
  }).compileComponents();
  const fixture = TestBed.createComponent(Register);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('Register accessibility (axe)', () => {
  it('exposes a titled region with labelled inputs, a password hint, and a submit', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#register-title')?.textContent).toContain('Create your account');
    expect(host.querySelector('[data-testid="register-email"]')).not.toBeNull();
    const password = host.querySelector('[data-testid="register-password"]');
    expect(password?.getAttribute('aria-describedby')).toContain('register-hint');
    expect(host.querySelector('#register-hint')?.textContent).toContain('8 characters');
    expect(host.querySelector('[data-testid="register-submit"]')?.textContent).toContain('Create account');
  });

  it('has no critical/serious violations in the idle state', async () => {
    const fixture = await render();
    await expectNoAxeViolations(fixture.nativeElement as HTMLElement);
  });

  it('announces the validation error in an alert region with no new violations', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector('form')!.dispatchEvent(new Event('submit')); // empty submit → error
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const error = host.querySelector('[data-testid="register-error"]');
    expect(error?.getAttribute('role')).toBe('alert');
    await expectNoAxeViolations(host);
  });
});

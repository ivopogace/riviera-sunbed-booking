import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { CustomerAuth } from '../core/customer-auth';
import { SignIn } from './sign-in';

/**
 * Structural axe audit of the customer sign-in page (S2 #111, AC-11): a titled region with labelled
 * email + password inputs and a submit control, in both the idle and error states. Contrast is not
 * measurable by axe under jsdom; real focus is proven in the e2e (phase 4, a real browser).
 */
const authStub: Partial<CustomerAuth> = { signIn: async () => 'error' };

async function render(): Promise<ComponentFixture<SignIn>> {
  await TestBed.configureTestingModule({
    imports: [SignIn],
    providers: [provideRouter([]), { provide: CustomerAuth, useValue: authStub }],
  }).compileComponents();
  const fixture = TestBed.createComponent(SignIn);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('SignIn accessibility (axe)', () => {
  it('exposes a titled region with labelled email + password inputs and a submit', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#signin-title')?.textContent).toContain('Sign in');
    expect(host.querySelector('[data-testid="signin-email"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="signin-password"]')).not.toBeNull();
    // Each input is named by its wrapping label.
    const labels = Array.from(host.querySelectorAll('label')).map((l) => l.textContent);
    expect(labels.join(' ')).toContain('Email');
    expect(labels.join(' ')).toContain('Password');
    expect(host.querySelector('[data-testid="signin-submit"]')?.textContent).toContain('Sign in');
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

    const error = host.querySelector('[data-testid="signin-error"]');
    expect(error?.getAttribute('role')).toBe('alert');
    await expectNoAxeViolations(host);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { OperatorAuth } from '../core/operator-auth';
import { OperatorRegister } from './operator-register';

/**
 * Structural axe audit of the operator self-registration page (S6 #115): a titled region with labelled
 * username / contact-email / password inputs (the password carries a described-by hint), a submit
 * control, and an error alert. Contrast is not measurable by axe under jsdom; real focus is in the e2e.
 */
const authStub: Partial<OperatorAuth> = { register: async () => 'error' };

async function render(): Promise<ComponentFixture<OperatorRegister>> {
  await TestBed.configureTestingModule({
    imports: [OperatorRegister],
    providers: [provideRouter([]), { provide: OperatorAuth, useValue: authStub }],
  }).compileComponents();
  const fixture = TestBed.createComponent(OperatorRegister);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('OperatorRegister accessibility (axe)', () => {
  it('exposes a titled region with labelled inputs, a password hint, and a submit', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('#op-register-title')?.textContent).toContain('Register as an operator');
    expect(host.querySelector('[data-testid="op-register-username"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="op-register-email"]')).not.toBeNull();
    const password = host.querySelector('[data-testid="op-register-password"]');
    expect(password?.getAttribute('aria-describedby')).toContain('op-register-hint');
    expect(host.querySelector('[data-testid="op-register-submit"]')?.textContent).toContain(
      'Request account',
    );
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

    expect(host.querySelector('[data-testid="op-register-error"]')?.getAttribute('role')).toBe('alert');
    await expectNoAxeViolations(host);
  });
});

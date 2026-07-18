import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { OperatorAuth, OperatorRegisterResult } from '../core/operator-auth';
import { OperatorRegister } from './operator-register';

/** An OperatorAuth stub whose register resolves to the given result; other members are inert. */
function authStub(
  result: OperatorRegisterResult,
): Partial<OperatorAuth> & { register: ReturnType<typeof vi.fn> } {
  return { register: vi.fn(async () => result) } as unknown as Partial<OperatorAuth> & {
    register: ReturnType<typeof vi.fn>;
  };
}

async function render(auth: Partial<OperatorAuth>): Promise<ComponentFixture<OperatorRegister>> {
  await TestBed.configureTestingModule({
    imports: [OperatorRegister],
    providers: [provideRouter([]), { provide: OperatorAuth, useValue: auth }],
  }).compileComponents();
  const fixture = TestBed.createComponent(OperatorRegister);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function setModel(
  fixture: ComponentFixture<OperatorRegister>,
  username: string,
  password: string,
  contactEmail: string,
): void {
  (
    fixture.componentInstance as unknown as {
      model: { set(v: { username: string; password: string; contactEmail: string }): void };
    }
  ).model.set({ username, password, contactEmail });
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<OperatorRegister>): void {
  (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
  fixture.detectChanges();
}

function errorText(fixture: ComponentFixture<OperatorRegister>): string {
  return (
    (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="op-register-error"]')
      ?.textContent ?? ''
  ).trim();
}

function pendingShown(fixture: ComponentFixture<OperatorRegister>): boolean {
  return (
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="op-register-pending"]') !==
    null
  );
}

describe('OperatorRegister', () => {
  it('submits (trimmed) and shows the pending-approval notice on success', async () => {
    const auth = authStub('submitted');
    const fixture = await render(auth);

    setModel(fixture, '  alice  ', 'password123', '  alice@venue.example  ');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.register).toHaveBeenCalledWith('alice', 'password123', 'alice@venue.example');
    expect(pendingShown(fixture)).toBe(true);
    expect(errorText(fixture)).toBe('');
  });

  it('rejects a short password client-side without calling the service', async () => {
    const auth = authStub('submitted');
    const fixture = await render(auth);

    setModel(fixture, 'alice', 'short', 'alice@venue.example'); // 5 chars < 8
    submit(fixture);
    await fixture.whenStable();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errorText(fixture)).toBe('Choose a password of 8–72 characters.');
    expect(pendingShown(fixture)).toBe(false);
  });

  it('requires every field before validating length or calling the service', async () => {
    const auth = authStub('submitted');
    const fixture = await render(auth);

    setModel(fixture, '', '', '');
    submit(fixture);
    await fixture.whenStable();

    expect(auth.register).not.toHaveBeenCalled();
    expect(errorText(fixture)).toBe('Enter a username, contact email, and password.');
  });

  it('shows the rate-limit copy on a 429 and stays on the form', async () => {
    const auth = authStub('rate-limited');
    const fixture = await render(auth);

    setModel(fixture, 'alice', 'password123', 'alice@venue.example');
    submit(fixture);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(errorText(fixture)).toBe('Too many attempts. Please wait a minute and try again.');
    expect(pendingShown(fixture)).toBe(false);
  });
});

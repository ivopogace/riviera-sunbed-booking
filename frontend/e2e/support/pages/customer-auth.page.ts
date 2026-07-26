import { expect, Locator, Page } from '@playwright/test';

/**
 * Page Object for the customer auth flow (S2 #111, epic #108) — the tourist-side twin of
 * {@link OperatorSignInPage}. Unlike the operator sign-in card, this spans the shell header
 * (Sign in / Register links ↔ "Signed in as …" + Sign out) and the two full-page forms
 * (`/account/register`, `/account/sign-in`). Header controls are keyed by their `data-testid`
 * (the desktop nav is the only one in the DOM at the Desktop-Chrome viewport); the form fields use
 * accessible-name locators (one Email/Password per page), so a11y regressions surface here too.
 *
 * <p>Since #351 the signed-in controls sit behind an account disclosure, so `signOut()` and
 * `gotoAccount()` open it first — callers are unaffected.
 */
export class CustomerAuthPage {
  /** Header (shell) controls. */
  readonly signInLink: Locator;
  readonly registerLink: Locator;
  readonly signedInAs: Locator;
  readonly signOutButton: Locator;
  /** "Your account" inside the account menu (#351). */
  readonly accountLink: Locator;

  /** Form fields (shared by both pages — one Email/Password input is present per page). */
  readonly email: Locator;
  readonly password: Locator;
  /** The generic failure message (role=alert; the backend never says why — D-8). */
  readonly error: Locator;
  readonly registerSubmit: Locator;
  readonly signInSubmit: Locator;
  /** SSO buttons (S4 #112 — present on both the sign-in and register cards). */
  readonly ssoGoogle: Locator;
  readonly ssoApple: Locator;

  constructor(private readonly page: Page) {
    this.signInLink = page.getByTestId('nav-signin');
    this.registerLink = page.getByTestId('nav-register');
    this.signedInAs = page.getByTestId('nav-user');
    this.signOutButton = page.getByTestId('nav-signout');
    this.accountLink = page.getByTestId('nav-account-link');

    this.email = page.getByLabel('Email', { exact: true });
    this.password = page.getByLabel('Password', { exact: true });
    this.error = page.getByRole('alert');
    this.registerSubmit = page.getByRole('button', { name: /^(Create account|Creating)/ });
    this.signInSubmit = page.getByRole('button', { name: /^Sign(ing)? in/ });
    this.ssoGoogle = page.getByTestId('sso-google');
    this.ssoApple = page.getByTestId('sso-apple');
  }

  async gotoRegister(): Promise<void> {
    await this.registerLink.click();
  }

  async gotoSignIn(): Promise<void> {
    await this.signInLink.click();
  }

  /** Fill the register form and submit — the round-trip is the caller's to await via expectations. */
  async register(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.registerSubmit.click();
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signInSubmit.click();
  }

  /** Reveal the signed-in controls — since #351 they live behind the account disclosure. */
  async openAccountMenu(): Promise<void> {
    await this.signedInAs.click();
  }

  async signOut(): Promise<void> {
    await this.openAccountMenu();
    await this.signOutButton.click();
  }

  /** Reach the account page (#351) the way a tourist does — through the header, not a URL. */
  async gotoAccount(): Promise<void> {
    await this.openAccountMenu();
    await this.accountLink.click();
  }

  /** Start "Continue with Google/Apple" — a full-page navigation (the caller awaits the signed-in state). */
  async continueWithGoogle(): Promise<void> {
    await this.ssoGoogle.click();
  }

  async continueWithApple(): Promise<void> {
    await this.ssoApple.click();
  }

  /** Signed out ⇔ the header offers the Sign in link. */
  async expectSignedOut(): Promise<void> {
    await expect(this.signInLink).toBeVisible();
  }

  async expectSignedInAs(email: string): Promise<void> {
    await expect(this.signedInAs).toContainText(email);
  }
}

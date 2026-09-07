import { expect, Locator, Page } from '@playwright/test';

import { openAccountMenu, openHeaderMenu } from '../shell';

/**
 * Page Object for the customer auth flow — the tourist-side twin of
 * {@link OperatorSignInPage}. Unlike the operator sign-in card, this spans the shell header
 * (the Sign in link + menu button ↔ the account chip) and the two full-page forms
 * (`/account/register`, `/account/sign-in`). Header controls are keyed by their `data-testid`
 * (the desktop nav is the only one in the DOM at the Desktop-Chrome viewport); the form fields use
 * accessible-name locators (one Email/Password per page), so a11y regressions surface here too.
 *
 * <p>Create an account, Your account and Sign out sit behind the header's disclosure, so
 * `gotoRegister()`, `gotoAccount()` and `signOut()` open it first — callers are unaffected.
 */
export class CustomerAuthPage {
  /** Header (shell) controls. */
  readonly signInLink: Locator;
  /** "Create an account" inside the signed-out menu. */
  readonly registerLink: Locator;
  /** The account chip; its accessible name carries the full address. */
  readonly signedInAs: Locator;
  readonly signOutButton: Locator;
  /** "Your account" inside the account menu. */
  readonly accountLink: Locator;

  /** Form fields (shared by both pages — one Email/Password input is present per page). */
  readonly email: Locator;
  readonly password: Locator;
  /** The generic failure message (role=alert; the backend never says why — D-8). */
  readonly error: Locator;
  readonly registerSubmit: Locator;
  readonly signInSubmit: Locator;
  /** SSO buttons — present on both the sign-in and register cards. */
  readonly ssoGoogle: Locator;
  readonly ssoApple: Locator;
  /** The proof-of-work control on the tourist register card, and its assistive-tech status line. */
  readonly challengeWidget: Locator;
  readonly challengeStatus: Locator;

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
    this.challengeWidget = page.getByTestId('challenge-widget');
    this.challengeStatus = page.getByTestId('challenge-status');
  }

  async gotoRegister(): Promise<void> {
    await openHeaderMenu(this.page);
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

  /** Reveal the signed-in controls — they live behind the account disclosure. */
  async openAccountMenu(): Promise<void> {
    await openAccountMenu(this.page);
  }

  async signOut(): Promise<void> {
    await this.openAccountMenu();
    await this.signOutButton.click();
  }

  /** Reach the account page the way a tourist does — through the header, not a URL. */
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
    await expect(this.signedInAs).toHaveAccessibleName(`Account: ${email}`);
  }
}

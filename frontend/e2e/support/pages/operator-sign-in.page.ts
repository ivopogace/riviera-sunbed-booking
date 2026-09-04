import { expect, Locator, Page } from '@playwright/test';

/**
 * Page Object for signing an operator in.
 *
 * There is no per-page operator sign-in card: `operatorSessionGuard` redirects every
 * operator surface to the **one** auth page at `/account/sign-in?audience=operator&returnUrl=…`, and
 * the card labels its credential field "Username" on that tab. The locators are accessible-name
 * based, and the unified card exposes the same names.
 *
 * Shared by the CI-safe mocked suite and the local real-backend suite, so the selectors and the
 * sign-in gesture live in ONE place.
 */
export class OperatorSignInPage {
  /** The unified auth card in its operator tab (replaces the old "Operator sign-in" heading). */
  readonly card: Locator;
  readonly username: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  /** The generic sign-in failure message (role=alert; the backend never says why — D-8). */
  readonly error: Locator;
  readonly signedInCard: Locator;
  readonly signOutButton: Locator;
  /** The register tab's fields, and the proof-of-work control the fenced registration hosts. */
  readonly contactEmail: Locator;
  readonly registerSubmit: Locator;
  readonly challengeWidget: Locator;
  readonly challengeStatus: Locator;

  constructor(private readonly page: Page) {
    this.card = page.getByTestId('auth-form');
    this.username = page.getByLabel('Username', { exact: true });
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: /^Sign(ing)? in/ });
    this.error = page.getByRole('alert');
    this.signedInCard = page.getByText(/^Signed in as/);
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
    this.contactEmail = page.getByLabel('Contact email', { exact: true });
    this.registerSubmit = page.getByRole('button', { name: /^(Request account|Submitting)/ });
    this.challengeWidget = page.getByTestId('challenge-widget');
    this.challengeStatus = page.getByTestId('challenge-status');
  }

  /** Go straight to the operator tab's register card, where the fence lives. */
  async gotoRegister(): Promise<void> {
    await this.page.goto('/account/sign-in?audience=operator&mode=register');
  }

  /** Fill the register card and submit; the caller awaits the outcome through its expectations. */
  async register(username: string, password: string, contactEmail: string): Promise<void> {
    await this.username.fill(username);
    await this.contactEmail.fill(contactEmail);
    await this.password.fill(password);
    await this.registerSubmit.click();
  }

  /** Go straight to the auth page with the operator tab preselected (no guard round-trip needed). */
  async goto(returnUrl?: string): Promise<void> {
    const target = returnUrl ? `&returnUrl=${encodeURIComponent(returnUrl)}` : '';
    await this.page.goto(`/account/sign-in?audience=operator${target}`);
  }

  /** Fill the card and submit — the session round-trip is the caller's to await via expectations. */
  async signIn(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submit.click();
  }

  /** Signed out ⇔ the guard has landed us on the unified card's operator tab. */
  async expectSignedOut(): Promise<void> {
    await expect(this.card).toBeVisible();
    await expect(this.page.getByTestId('auth-identifier-label')).toHaveText('Username');
  }

  async expectSignedInAs(username: string): Promise<void> {
    await expect(this.signedInCard).toContainText(username);
  }

  async signOut(): Promise<void> {
    await this.signOutButton.click();
  }
}

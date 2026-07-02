import { expect, Locator, Page } from '@playwright/test';

/**
 * Page Object for the operator sign-in card (issue #109; the POM convention adopted per
 * issue #120 item 1 — auth-flow objects first, other flows migrate opportunistically).
 * Models the venue-admin editor's sign-in surface; shared by the CI-safe mocked suite and
 * the local real-backend suite so selectors and the sign-in gesture live in ONE place as
 * the auth epic (#108) multiplies the specs that need them.
 */
export class OperatorSignInPage {
  readonly heading: Locator;
  readonly username: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  /** The generic sign-in failure message (role=alert; the backend never says why — D-8). */
  readonly error: Locator;
  readonly signedInCard: Locator;
  readonly signOutButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Operator sign-in' });
    this.username = page.getByLabel('Username', { exact: true });
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: /^Sign(ing)? in/ });
    this.error = page.getByRole('alert');
    this.signedInCard = page.getByText(/^Signed in as/);
    this.signOutButton = page.getByRole('button', { name: 'Sign out' });
  }

  /** Fill the card and submit — the session round-trip is the caller's to await via expectations. */
  async signIn(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submit.click();
  }

  async expectSignedOut(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  async expectSignedInAs(username: string): Promise<void> {
    await expect(this.signedInCard).toContainText(username);
  }

  async signOut(): Promise<void> {
    await this.signOutButton.click();
  }
}

import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from '../support/axe';
import { OperatorSignInPage } from '../support/pages/operator-sign-in.page';
import {
  OPERATOR_USERNAME,
  createVenue,
  signInOperator,
  venueName,
} from './support/operator';

/**
 * Real-backend e2e for venue ONBOARDING (the retired editor's surviving job, O8 #177). A real
 * Chromium drives the /venue-admin create-a-venue form, which calls the REAL Spring Boot backend and
 * persists to a REAL Flyway-migrated Postgres — nothing is mocked. Editing an existing venue (layout,
 * pricing, details, commodities) moved to the operator console tabs; the console Venue tab's real
 * round-trip is `real-backend/venue.e2e.ts`.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/venue-admin');
});

test.describe('venue onboarding — real backend, real Postgres', () => {
  test('gates the create form behind operator sign-in', async ({ page }) => {
    // Signed out: the sign-in card shows and the create form is hidden.
    await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Venue details' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create venue' })).toHaveCount(0);

    // A real session login (server-validated, cookie established) reveals the create form.
    await signInOperator(page);
    await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();
  });

  test('a wrong operator password is rejected AT sign-in with the generic message', async ({
    page,
  }) => {
    // Server-validated login (issue #109): the real 401 arrives immediately — the create surface is
    // never revealed — and the message is deliberately generic (no account enumeration, D-8).
    const card = new OperatorSignInPage(page);
    await card.signIn(OPERATOR_USERNAME, 'definitely-not-the-password');

    await expect(card.error).toContainText('Sign-in failed');
    await card.expectSignedOut();
    await expect(page.getByRole('heading', { name: 'Venue details' })).toHaveCount(0);
  });

  test('creates a venue (real 201) and links the operator into its console', async ({ page }) => {
    await signInOperator(page);
    const id = await createVenue(page, venueName('create'));

    // The created card confirms the id and offers the "Open the console" link to lay out the venue.
    await expect(page.getByTestId('venue-created')).toContainText(`#${id}`);
    await expect(page.getByTestId('venue-console-link')).toHaveAttribute('href', `/operator/${id}`);
  });

  test('the onboarding form has no serious axe violations (real render)', async ({ page }) => {
    await signInOperator(page);
    await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();

    // Mirror the a11y suite's bar (shared policy): WCAG 2 A/AA, gate on serious + critical.
    await expectNoSeriousAxeViolations(page, 'venue onboarding (real backend)');
  });
});

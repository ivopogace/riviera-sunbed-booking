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
 * Real-backend e2e for venue ONBOARDING, which lives on the operator home's create state since #278
 * (`/operator?create=1`; the retired `/venue-admin` page now redirects there). A real Chromium
 * drives the create form, which calls the REAL Spring Boot backend and persists to a REAL
 * Flyway-migrated Postgres — nothing is mocked. Editing an existing venue (layout, pricing, details,
 * commodities) lives in the console tabs; the Venue tab's real round-trip is
 * `real-backend/venue.e2e.ts`.
 */

test.beforeEach(async ({ page }) => {
  // The guard bounces a signed-out visit to the unified auth card with the operator tab preselected.
  await page.goto('/operator?create=1');
});

test.describe('venue onboarding — real backend, real Postgres', () => {
  test('gates the create form behind operator sign-in', async ({ page }) => {
    // Signed out: the unified auth card shows (real guard + session restore) — no create form.
    const card = new OperatorSignInPage(page);
    await card.expectSignedOut();
    await expect(page.getByRole('heading', { name: 'Venue details' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create venue' })).toHaveCount(0);

    // A real session login (server-validated, cookie established) returns to the create state.
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

  test('creates a venue (real 201) and lands the operator in its console beach-map tab', async ({
    page,
  }) => {
    await signInOperator(page);
    const id = await createVenue(page, venueName('create'));

    // #278: creation navigates STRAIGHT into the new console — the id comes from the real 201.
    await expect(page).toHaveURL(new RegExp(`/operator/${id}/beach-map`));
    await expect(page.getByTestId('oc-header')).toBeVisible();
  });

  test('the onboarding form has no serious axe violations (real render)', async ({ page }) => {
    await signInOperator(page);
    await page.goto('/operator?create=1');
    await expect(page.getByRole('heading', { name: 'Venue details' })).toBeVisible();

    // Mirror the a11y suite's bar (shared policy): WCAG 2 A/AA, gate on serious + critical.
    await expectNoSeriousAxeViolations(page, 'venue onboarding (real backend)');
  });
});

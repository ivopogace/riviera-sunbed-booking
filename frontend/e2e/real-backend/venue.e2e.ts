import { expect, test } from '@playwright/test';

import { expectNoSeriousAxeViolations } from '../support/axe';
import { createVenue, signInOperator, venueName } from './support/operator';

/**
 * Real-backend e2e for the O8 Venue & commodities console tab (#177). A real Chromium onboards a
 * fresh venue, opens its tab in the operator console, and edits the details + commodities through the
 * REAL owner-asserted profile write (PATCH /api/venues/{id}) — persisted to real Postgres. It then
 * proves the round-trip: the edited name + amenity chips + to-water render on the PUBLIC tourist
 * beach-map, and the flipped booking mode persists (visible again on re-opening the tab). Nothing is
 * mocked; the unit/IT layers cover the pieces, this proves the wired system end to end.
 */

test('edits venue details + commodities via the console tab → tourist beach-map re-renders', async ({
  page,
}) => {
  // Onboard a fresh venue (INSTANT, 15% commission by default), then open its Venue tab in the console.
  await page.goto('/operator');
  await signInOperator(page);
  const id = await createVenue(page, venueName('venue-tab'));

  await page.goto(`/operator/${id}/venue`);
  await expect(page.getByTestId('venue-tab')).toBeVisible();
  // The form pre-fills from the just-created venue; commission is a read-only % (the platform's cut).
  await expect(page.getByTestId('venue-commission')).toHaveText('15%');
  await expect(page.getByTestId('venue-payout-currency')).toHaveText('EUR');
  await expectNoSeriousAxeViolations(page, 'venue tab (real backend)');

  // Edit: rename, flip mode to REQUEST, toggle amenities on, set the distance, then save.
  const renamed = venueName('renamed');
  await page.getByTestId('venue-name').fill(renamed);
  await page.getByTestId('venue-booking-mode').selectOption('REQUEST');
  await page.getByTestId('amenity-toggle-BEACH_BAR').click();
  await page.getByTestId('amenity-toggle-WIFI').click();
  await page.getByTestId('amenity-toggle-FREE_PARKING').click();
  await page.getByTestId('venue-distance').fill('15');
  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();

  // The round-trip: the PUBLIC tourist beach-map (a different component, same real API + Postgres)
  // now shows the edited name + amenity chips + to-water — the re-render AC.
  await page.goto(`/venues/${id}`);
  await expect(page.getByText(renamed).first()).toBeVisible();
  const chips = page.getByTestId('venue-chips');
  await expect(chips).toContainText('15m to water');
  await expect(chips).toContainText('Beach bar');
  await expect(chips).toContainText('WiFi');
  await expect(chips).toContainText('Free parking');

  // The booking-mode flip persisted: re-opening the tab shows REQUEST (drives the tourist Request flow).
  await page.goto(`/operator/${id}/venue`);
  await expect(page.getByTestId('venue-booking-mode')).toHaveValue('REQUEST');
});

test('a stale-tab save is rejected with the 409 banner, and Reload recovers (#224)', async ({
  page,
  context,
}) => {
  // Onboard a fresh venue and open its tab (loads at version 0) — this is the "stale" tab.
  await page.goto('/operator');
  await signInOperator(page);
  const id = await createVenue(page, venueName('stale'));
  await page.goto(`/operator/${id}/venue`);
  await expect(page.getByTestId('venue-tab')).toBeVisible();
  await expect(page.getByTestId('venue-booking-mode')).toHaveValue('INSTANT');

  // A SECOND tab in the same session (a concurrent operator device) flips the mode and saves —
  // bumping the venue's version on the server behind the first tab's back.
  const other = await context.newPage();
  await other.goto(`/operator/${id}/venue`);
  await expect(other.getByTestId('venue-tab')).toBeVisible();
  await other.getByTestId('venue-booking-mode').selectOption('REQUEST');
  await other.getByTestId('venue-save').click();
  await expect(other.getByTestId('venue-saved')).toBeVisible();
  await other.close();

  // The first tab (still holding the old version) edits and saves → real 409 STALE_WRITE. The
  // conflict banner shows, and the operator's edit is PRESERVED (never a silent clobber — the exact
  // #224 scenario: the stale INSTANT is NOT written back over the deliberate REQUEST).
  await page.getByTestId('venue-name').fill('Stale Edit');
  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-stale-banner')).toBeVisible();
  await expect(page.getByTestId('venue-name')).toHaveValue('Stale Edit');
  await expect(page.getByTestId('venue-saved')).toBeHidden();

  // Reload pulls the latest server state (the concurrent REQUEST flip + new version) and clears the banner.
  await page.getByTestId('venue-stale-reload').click();
  await expect(page.getByTestId('venue-stale-banner')).toBeHidden();
  await expect(page.getByTestId('venue-booking-mode')).toHaveValue('REQUEST');

  // Re-applying and saving now succeeds against the fresh version.
  await page.getByTestId('venue-name').fill('After Reload');
  await page.getByTestId('venue-save').click();
  await expect(page.getByTestId('venue-saved')).toBeVisible();
});

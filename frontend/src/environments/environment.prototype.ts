/**
 * PROTOTYPE ONLY (issue #1134) — swapped in by the `prototype` build configuration.
 *
 * <p>`apiBaseUrl` is empty so every map resource (`/map/style.json`, the glyphs, sprites and the
 * PMTiles archive) resolves against the dev server itself, which the same configuration serves
 * from `platform/map`. The prototype therefore runs the REAL MapLibre map with the real riviera
 * tiles from `npm run prototype:1134` alone — no Spring backend, no Postgres, no Docker. The venue
 * list is a fixture (`prototype-1134/crowd-fixture.ts`), so no `/api` call is made at all.
 */
export const environment = {
  production: false,
  apiBaseUrl: '',
  stripePublishableKey: '',
};

/**
 * Production (non-prod/demo deploy) environment. The committed `apiBaseUrl` is the
 * expected Render host; the CD workflow can override it at build time from the
 * `BACKEND_API_URL` repo variable (a public URL, not a secret) without a code edit.
 * See docs/deploy/cd-pipeline.md.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://riviera-sunbed-booking.onrender.com',
};

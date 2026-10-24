/**
 * The CD deploy job's liveness check (issue #1632): polls the backend until `/actuator/info` names the
 * commit this run deployed and `/actuator/health` is UP, and fails at the deadline otherwise.
 *
 * Render keeps the previous instance serving until the new one passes its health check, so a bare
 * health poll is answered by the old build and a deploy whose new instance never boots still goes
 * green. The commit on `/actuator/info` (`BuildCommitInfoContributor`) is what tells them apart.
 *
 * Usage (env, as `deploy.yml` sets it):
 *   BACKEND_API_URL=https://<name>.onrender.com EXPECTED_SHA=<40-hex> node scripts/wait-for-live-commit.mjs
 * Optional: `POLL_DEADLINE_SECONDS` (default 900, the ~15-min cold-start bound), `POLL_INTERVAL_SECONDS` (10).
 *
 * Fail-closed: a missing URL, a malformed SHA, or a deadline passed without a match each exit 1.
 */

import { pathToFileURL } from 'node:url';

export const DEFAULT_DEADLINE_SECONDS = 900;
export const DEFAULT_INTERVAL_SECONDS = 10;

/** A single request's bound; Render's edge answers a sleeping instance slowly, never this slowly. */
const REQUEST_TIMEOUT_MS = 10_000;

const FULL_SHA = /^[0-9a-f]{40}$/;
const COMMIT_ID = /^[0-9a-f]{7,64}$/;

/** How much of a response body a log line quotes. */
const NOTE_LIMIT = 200;

/**
 * One probe: the live commit (null when info is unreadable or has none) and whether health reads UP.
 *
 * @param {string} baseUrl backend origin, no trailing slash
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ commit: string | null, up: boolean, note: string }>}
 */
export async function probe(baseUrl, fetchImpl = fetch) {
  const info = await readJson(`${baseUrl}/actuator/info`, fetchImpl);
  const health = await readJson(`${baseUrl}/actuator/health`, fetchImpl);
  // The body is the backend's to write, and the log is the runner's: only a commit id reaches it unquoted.
  const reported = info.body?.commit;
  const commit = typeof reported === 'string' && COMMIT_ID.test(reported) ? reported : null;
  const up = health.body?.status === 'UP';
  return { commit, up, note: `info: ${info.note}; health: ${health.note}` };
}

async function readJson(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const text = await response.text();
    if (!response.ok) return { body: null, note: `HTTP ${response.status}` };
    return { body: JSON.parse(text), note: quoted(text) };
  } catch (error) {
    return { body: null, note: `unreachable (${quoted(error.message)})` };
  }
}

/** A single-line, bounded, JSON-escaped quote, so no response text can start an Actions `::command::` line. */
function quoted(text) {
  return JSON.stringify(String(text).trim().slice(0, NOTE_LIMIT));
}

/**
 * Polls until the live commit equals `expected` with health UP, or the deadline passes.
 *
 * @param {{ baseUrl: string, expected: string, deadlineMs: number, intervalMs: number,
 *   fetchImpl?: typeof fetch, now?: () => number, log?: (line: string) => void }} options
 * @returns {Promise<{ live: boolean, attempts: number, commit: string | null }>}
 */
export async function waitForLiveCommit({
  baseUrl,
  expected,
  deadlineMs,
  intervalMs,
  fetchImpl = fetch,
  now = Date.now,
  log = console.log,
}) {
  const deadline = now() + deadlineMs;
  let attempts = 0;
  let commit = null;
  for (;;) {
    attempts += 1;
    const result = await probe(baseUrl, fetchImpl);
    commit = result.commit;
    if (commit === expected && result.up) {
      log(`attempt ${attempts}: live commit ${commit}, health UP — the new build is live.`);
      return { live: true, attempts, commit };
    }
    log(
      `attempt ${attempts}: live commit ${commit ?? 'unknown'}, waiting for ${expected} (${result.note})`,
    );
    if (now() + intervalMs > deadline) return { live: false, attempts, commit };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Reads the job's env, polls, and returns the process exit code.
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch, log?: (line: string) => void }} [deps]
 * @returns {Promise<number>}
 */
export async function main(env, { fetchImpl = fetch, log = console.log } = {}) {
  let baseUrl = (env.BACKEND_API_URL ?? '').trim();
  while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  const expected = (env.EXPECTED_SHA ?? '').trim();
  if (!baseUrl) {
    log('::error::BACKEND_API_URL is not set, so the deploy cannot be verified live.');
    return 1;
  }
  if (!FULL_SHA.test(expected)) {
    log(`::error::EXPECTED_SHA ${JSON.stringify(expected)} is not a full lowercase commit SHA.`);
    return 1;
  }
  const deadlineSeconds = Number(env.POLL_DEADLINE_SECONDS ?? DEFAULT_DEADLINE_SECONDS);
  const intervalSeconds = Number(env.POLL_INTERVAL_SECONDS ?? DEFAULT_INTERVAL_SECONDS);
  if (!(deadlineSeconds > 0 && intervalSeconds > 0)) {
    log('::error::POLL_DEADLINE_SECONDS and POLL_INTERVAL_SECONDS must be positive numbers.');
    return 1;
  }
  log(
    `Polling ${baseUrl}/actuator/info for commit ${expected} (up to ${deadlineSeconds}s; Render cold-starts)…`,
  );
  const { live, commit } = await waitForLiveCommit({
    baseUrl,
    expected,
    deadlineMs: deadlineSeconds * 1000,
    intervalMs: intervalSeconds * 1000,
    fetchImpl,
    log,
  });
  if (live) return 0;
  log(
    `::error::Commit ${expected} did not go live within ${deadlineSeconds}s; still serving ` +
      `${commit ?? 'an unknown commit'}. Check Render's build and boot logs for this deploy.`,
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.env);
}

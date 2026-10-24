/**
 * `wait-for-live-commit.mjs` against a stub backend over real HTTP (issue #1632). The cases that earn the
 * script are the red ones: a deploy whose new instance never boots leaves the old commit serving, and the
 * poll must fail at its deadline rather than accept the old instance's healthy answer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { main, waitForLiveCommit } from './wait-for-live-commit.mjs';

const OLD = '1111111111111111111111111111111111111111';
const NEW = '2222222222222222222222222222222222222222';

/**
 * A stub backend whose `/actuator/info` and `/actuator/health` answers come from `answer(path, hit)`,
 * `hit` counting that path's requests from 1.
 */
async function stubBackend(answer) {
  const hits = new Map();
  const server = createServer((request, response) => {
    const hit = (hits.get(request.url) ?? 0) + 1;
    hits.set(request.url, hit);
    const { status = 200, body } = answer(request.url, hit);
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((r) => server.close(r)),
  };
}

const healthy = (commit) => (path) =>
  path === '/actuator/info' ? { body: commit ? { commit } : {} } : { body: { status: 'UP' } };

const poll = (baseUrl, deadlineMs = 2_000) =>
  waitForLiveCommit({ baseUrl, expected: NEW, deadlineMs, intervalMs: 5, log: () => {} });

test('a deploy already live passes on the first attempt', async () => {
  const backend = await stubBackend(healthy(NEW));
  try {
    assert.deepEqual(await poll(backend.baseUrl), { live: true, attempts: 1, commit: NEW });
  } finally {
    await backend.close();
  }
});

test('the old instance answering healthy is waited out until the new commit serves', async () => {
  const backend = await stubBackend((path, hit) =>
    path === '/actuator/info'
      ? { body: { commit: hit < 4 ? OLD : NEW } }
      : { body: { status: 'UP' } },
  );
  try {
    assert.deepEqual(await poll(backend.baseUrl), { live: true, attempts: 4, commit: NEW });
  } finally {
    await backend.close();
  }
});

test('a new instance that never boots fails at the deadline, naming the commit still served', async () => {
  const backend = await stubBackend(healthy(OLD));
  try {
    const result = await poll(backend.baseUrl, 60);
    assert.equal(result.live, false);
    assert.equal(result.commit, OLD);
    assert.ok(result.attempts > 1, `polled ${result.attempts} times`);
  } finally {
    await backend.close();
  }
});

test('the new commit is not live until health also reads UP', async () => {
  const backend = await stubBackend((path, hit) =>
    path === '/actuator/info'
      ? { body: { commit: NEW } }
      : hit < 3
        ? { status: 503, body: { status: 'DOWN' } }
        : { body: { status: 'UP' } },
  );
  try {
    assert.deepEqual(await poll(backend.baseUrl), { live: true, attempts: 3, commit: NEW });
  } finally {
    await backend.close();
  }
});

test('an unreadable info body, an error status or no commit keeps polling', async () => {
  const backend = await stubBackend((path, hit) => {
    if (path !== '/actuator/info') return { body: { status: 'UP' } };
    return (
      [{ body: 'not json' }, { status: 401, body: {} }, { body: {} }][hit - 1] ?? {
        body: { commit: NEW },
      }
    );
  });
  try {
    assert.deepEqual(await poll(backend.baseUrl), { live: true, attempts: 4, commit: NEW });
  } finally {
    await backend.close();
  }
});

test('an unreachable backend fails at the deadline with no commit', async () => {
  const backend = await stubBackend(healthy(NEW));
  await backend.close();
  const result = await poll(backend.baseUrl, 30);
  assert.equal(result.live, false);
  assert.equal(result.commit, null);
});

test('main exits 0 once live, logging the live commit, and accepts a trailing slash on the URL', async () => {
  const backend = await stubBackend(healthy(NEW));
  const lines = [];
  try {
    const code = await main(
      {
        BACKEND_API_URL: `${backend.baseUrl}/`,
        EXPECTED_SHA: NEW,
        POLL_DEADLINE_SECONDS: '1',
        POLL_INTERVAL_SECONDS: '0.01',
      },
      { log: (line) => lines.push(line) },
    );
    assert.equal(code, 0);
    assert.ok(
      lines.some((line) => line.includes(`live commit ${NEW}, health UP`)),
      lines.join('\n'),
    );
    assert.equal(backend.hits.get('/actuator/info'), 1);
  } finally {
    await backend.close();
  }
});

test('main exits 1 with an error annotation when the old commit outlasts the deadline', async () => {
  const backend = await stubBackend(healthy(OLD));
  const lines = [];
  try {
    const code = await main(
      {
        BACKEND_API_URL: backend.baseUrl,
        EXPECTED_SHA: NEW,
        POLL_DEADLINE_SECONDS: '0.05',
        POLL_INTERVAL_SECONDS: '0.01',
      },
      { log: (line) => lines.push(line) },
    );
    assert.equal(code, 1);
    assert.match(
      lines.at(-1),
      /^::error::Commit 2{40} did not go live within 0\.05s; still serving 1{40}\./,
    );
  } finally {
    await backend.close();
  }
});

for (const [name, env, message] of [
  ['an unset URL', { EXPECTED_SHA: NEW }, /BACKEND_API_URL is not set/],
  [
    'a short SHA',
    { BACKEND_API_URL: 'http://x', EXPECTED_SHA: 'abc1234' },
    /not a full lowercase commit SHA/,
  ],
  ['an unset SHA', { BACKEND_API_URL: 'http://x' }, /not a full lowercase commit SHA/],
  [
    'a non-numeric deadline',
    { BACKEND_API_URL: 'http://x', EXPECTED_SHA: NEW, POLL_DEADLINE_SECONDS: 'soon' },
    /must be positive/,
  ],
  [
    'a zero interval',
    { BACKEND_API_URL: 'http://x', EXPECTED_SHA: NEW, POLL_INTERVAL_SECONDS: '0' },
    /must be positive/,
  ],
]) {
  test(`main fails closed on ${name} without polling`, async () => {
    const lines = [];
    const fetchImpl = () => assert.fail('polled despite bad configuration');
    assert.equal(await main(env, { fetchImpl, log: (line) => lines.push(line) }), 1);
    assert.match(lines.join('\n'), message);
  });
}

test('a response body never writes its own line into the Actions log', async () => {
  const backend = await stubBackend((path) =>
    path === '/actuator/info'
      ? { body: { commit: `${OLD}\n::error::forged`, note: '\n::warning::forged' } }
      : { body: '{"status":"DOWN"}\n::add-mask::x' },
  );
  const lines = [];
  try {
    const result = await waitForLiveCommit({
      baseUrl: backend.baseUrl,
      expected: NEW,
      deadlineMs: 20,
      intervalMs: 5,
      log: (line) => lines.push(line),
    });
    assert.equal(
      result.commit,
      null,
      'a commit field that is not a bare commit id is not read as one',
    );
    for (const line of lines) {
      assert.ok(!line.includes('\n'), line);
      assert.match(line, /^attempt \d+: live commit unknown, /);
    }
  } finally {
    await backend.close();
  }
});

test('health is not asked while an older commit is served', async () => {
  const backend = await stubBackend(healthy(OLD));
  try {
    const result = await poll(backend.baseUrl, 30);
    assert.equal(result.live, false);
    assert.ok(backend.hits.get('/actuator/info') > 1);
    assert.equal(backend.hits.get('/actuator/health'), undefined);
  } finally {
    await backend.close();
  }
});

test('a body that answered but is not JSON is logged as such, not as unreachable', async () => {
  const backend = await stubBackend((path) =>
    path === '/actuator/info' ? { body: '<html>waking up</html>' } : { body: { status: 'UP' } },
  );
  const lines = [];
  try {
    await waitForLiveCommit({
      baseUrl: backend.baseUrl,
      expected: NEW,
      deadlineMs: 10,
      intervalMs: 5,
      log: (line) => lines.push(line),
    });
    assert.match(lines[0], /\(info: not JSON \("<html>waking up<\/html>"\)\)$/);
  } finally {
    await backend.close();
  }
});

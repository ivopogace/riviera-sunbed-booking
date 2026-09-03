-- #905 (epic #903, ADR-0016): the proof-of-work challenge's single-use registry — one row per
-- solved challenge the platform edge has accepted, keyed by the challenge's signed nonce. The
-- verifier claims the row with INSERT … ON CONFLICT DO NOTHING and accepts the solution only if the
-- insert wins (the invariant-#2 idiom), so neither a restart nor a second instance reopens a replay
-- window — the one place the edge departs from the rate limiter's in-memory precedent.
-- expires_at is the challenge's own expiry (UTC instant, invariant #6); the sweep deletes rows whose
-- expiry lies further in the past than the clock-skew allowance, a range the index serves. No FK:
-- nothing else references a challenge. Verified by ChallengeRegistryMigrationIT.
CREATE TABLE challenge_registry (
    challenge_id TEXT PRIMARY KEY,
    expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX challenge_registry_expires_idx ON challenge_registry (expires_at);

-- U1 (issue #4): pre-launch DEMO fixture — Miramar Beach Club, Ksamil.
--
-- Mirrors the U1 design contract (docs/design/u1-beach-map/): 4 rows × 6 sets.
-- Front row PREMIUM/ONLINE (€45), Row 2 €35 and Row 3 €30 (STANDARD/ONLINE), Row 4 €25
-- (STANDARD/WALK_IN). Taken pattern per the design → 6 taken, 18 of 24 free. from-price €25.
--
-- This is demo data, not a real tenant — it is removed/superseded when U7 (venue
-- onboarding) can create real venues. PK is identity, so we do not supply venue.id;
-- the seed venue is the first row (id 1) and the set rows resolve venue_id by name.

INSERT INTO venue (name, beach, region, description, rating_tenths, reviews_count,
                   booking_mode, commission_bps, payout_currency, booking_cutoff)
VALUES ('Miramar Beach Club', 'Ksamil', 'Albanian Riviera',
        'Premium loungers on the Ksamil shoreline.',
        48, 326, 'INSTANT', 1500, 'EUR', '18:00');

INSERT INTO set_position (venue_id, row_label, position_no, tier, pool,
                          price_minor, price_currency, grid_x, grid_y, seed_availability)
SELECT v.id, s.row_label, s.position_no, s.tier, s.pool,
       s.price_minor, 'EUR', s.position_no, s.grid_y, s.seed_availability
FROM   venue v
CROSS  JOIN (VALUES
    -- Row 1 — Front row · Sea view (PREMIUM, ONLINE, €45) — taken: t a a t a a
    ('Front row · Sea view', 1, 'PREMIUM', 'ONLINE', 4500, 1, 'TAKEN'),
    ('Front row · Sea view', 2, 'PREMIUM', 'ONLINE', 4500, 1, 'FREE'),
    ('Front row · Sea view', 3, 'PREMIUM', 'ONLINE', 4500, 1, 'FREE'),
    ('Front row · Sea view', 4, 'PREMIUM', 'ONLINE', 4500, 1, 'TAKEN'),
    ('Front row · Sea view', 5, 'PREMIUM', 'ONLINE', 4500, 1, 'FREE'),
    ('Front row · Sea view', 6, 'PREMIUM', 'ONLINE', 4500, 1, 'FREE'),
    -- Row 2 (STANDARD, ONLINE, €35) — taken: a a t a a a
    ('Row 2', 1, 'STANDARD', 'ONLINE', 3500, 2, 'FREE'),
    ('Row 2', 2, 'STANDARD', 'ONLINE', 3500, 2, 'FREE'),
    ('Row 2', 3, 'STANDARD', 'ONLINE', 3500, 2, 'TAKEN'),
    ('Row 2', 4, 'STANDARD', 'ONLINE', 3500, 2, 'FREE'),
    ('Row 2', 5, 'STANDARD', 'ONLINE', 3500, 2, 'FREE'),
    ('Row 2', 6, 'STANDARD', 'ONLINE', 3500, 2, 'FREE'),
    -- Row 3 (STANDARD, ONLINE, €30) — taken: a t a a a t
    ('Row 3', 1, 'STANDARD', 'ONLINE', 3000, 3, 'FREE'),
    ('Row 3', 2, 'STANDARD', 'ONLINE', 3000, 3, 'TAKEN'),
    ('Row 3', 3, 'STANDARD', 'ONLINE', 3000, 3, 'FREE'),
    ('Row 3', 4, 'STANDARD', 'ONLINE', 3000, 3, 'FREE'),
    ('Row 3', 5, 'STANDARD', 'ONLINE', 3000, 3, 'FREE'),
    ('Row 3', 6, 'STANDARD', 'ONLINE', 3000, 3, 'TAKEN'),
    -- Row 4 · Back (STANDARD, WALK_IN, €25) — taken: a a a t a a
    ('Row 4 · Back', 1, 'STANDARD', 'WALK_IN', 2500, 4, 'FREE'),
    ('Row 4 · Back', 2, 'STANDARD', 'WALK_IN', 2500, 4, 'FREE'),
    ('Row 4 · Back', 3, 'STANDARD', 'WALK_IN', 2500, 4, 'FREE'),
    ('Row 4 · Back', 4, 'STANDARD', 'WALK_IN', 2500, 4, 'TAKEN'),
    ('Row 4 · Back', 5, 'STANDARD', 'WALK_IN', 2500, 4, 'FREE'),
    ('Row 4 · Back', 6, 'STANDARD', 'WALK_IN', 2500, 4, 'FREE')
) AS s(row_label, position_no, tier, pool, price_minor, grid_y, seed_availability)
WHERE  v.name = 'Miramar Beach Club';

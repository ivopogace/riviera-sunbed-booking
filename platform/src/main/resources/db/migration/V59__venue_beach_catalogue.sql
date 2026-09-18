-- The venue's beach becomes one entry of the fixed platform catalogue (the enum
-- ai.riviera.platform.venue.vocabulary.Beach; the wire code is the enum name), and its region is
-- derived from that entry rather than stored, so the region column goes. Every existing row is
-- mapped to KSAMIL: the platform is pre-launch and the dev rows are re-pointed by hand afterwards.
-- The catalogue CHECK is the DB-level backstop behind the edge validation (invariant #12), kept in
-- lockstep with the enum's names exactly as venue_amenity_catalogue_check (V21) mirrors Amenity.

UPDATE venue SET beach = 'KSAMIL';

ALTER TABLE venue
    ADD CONSTRAINT venue_beach_catalogue_check
        CHECK (beach IN ('VELIPOJE', 'SHENGJIN', 'TALE', 'PATOK',
                         'LALEZ', 'CURRILA', 'DURRES', 'SHKEMBI_I_KAVAJES', 'GOLEM', 'QERRET', 'SPILLE',
                         'DIVJAKE', 'SEMAN', 'DAREZEZE',
                         'ZVERNEC', 'VLORE', 'RADHIME', 'ORIKUM',
                         'PALASE', 'DRYMADES', 'DHERMI', 'GJIPE', 'JALE', 'LIVADHI', 'HIMARE', 'POTAM',
                         'LLAMANI', 'QEPARO', 'BORSH', 'LUKOVE', 'BUNEC', 'KAKOME',
                         'SARANDE', 'PASQYRA', 'PULEBARDHA', 'KSAMIL'));

ALTER TABLE venue DROP COLUMN region;

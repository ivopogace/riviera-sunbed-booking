-- V8 (issue #8, PR #53 review): the Spring Modulith Event Publication Registry.
--
-- U4 moves the payment->booking confirmation from a synchronous @EventListener to an
-- asynchronous @ApplicationModuleListener so durability no longer depends on the webhook
-- transaction rolling back: the registry persists each publication before delivery and marks it
-- complete only after the listener succeeds; incomplete publications are re-submitted (on restart,
-- per spring.modulith.events.republish-outstanding-events-on-restart). At-least-once with only a
-- database table, no broker.
--
-- This is the EXACT shipped Modulith 2.1 schema for PostgreSQL (the v2 "structure" — the default,
-- use-legacy-structure=false — which carries the status/completion_attempts/last_resubmission_date
-- columns the 2.1 repository reads), copied verbatim rather than hand-rolled (invariant #12: Flyway
-- owns the schema; schema-initialization is left OFF). Completion mode is ARCHIVE, so completed
-- publications are MOVED to event_publication_archive — both tables are required.
--
-- Source: spring-modulith-events-jdbc-2.1.0.jar
--   org/springframework/modulith/events/jdbc/schemas/v2/schema-postgresql.sql
--   org/springframework/modulith/events/jdbc/schemas/v2/schema-postgresql-archive.sql

CREATE TABLE IF NOT EXISTS event_publication
(
  id                     UUID NOT NULL,
  listener_id            TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  serialized_event       TEXT NOT NULL,
  publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
  completion_date        TIMESTAMP WITH TIME ZONE,
  status                 TEXT,
  completion_attempts    INT,
  last_resubmission_date TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS event_publication_serialized_event_hash_idx ON event_publication USING hash(serialized_event);
CREATE INDEX IF NOT EXISTS event_publication_by_completion_date_idx ON event_publication (completion_date);

-- ARCHIVE completion mode moves completed publications here (keeps the live table small while
-- retaining an auditable history).
CREATE TABLE IF NOT EXISTS event_publication_archive
(
  id                     UUID NOT NULL,
  listener_id            TEXT NOT NULL,
  event_type             TEXT NOT NULL,
  serialized_event       TEXT NOT NULL,
  publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
  completion_date        TIMESTAMP WITH TIME ZONE,
  status                 TEXT,
  completion_attempts    INT,
  last_resubmission_date TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS event_publication_archive_serialized_event_hash_idx ON event_publication_archive USING hash(serialized_event);
CREATE INDEX IF NOT EXISTS event_publication_archive_by_completion_date_idx ON event_publication_archive (completion_date);

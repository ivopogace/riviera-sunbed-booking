-- Issue #386: make the `domain` constraint agree with the Java writer, in BOTH directions.
--
-- V33 carried V32's `CHECK (domain = lower(btrim(domain)))` across the hashed-key rewrite. One-arg
-- `btrim` strips SPACES ONLY, so two values satisfied the constraint that `JdbcEmailSuppressions`
-- could never have produced:
--
--   * tab/newline/CR/form-feed padding -- Java's String#trim() strips every code point <= U+0020,
--     so a normalized address cannot carry edge whitespace of any kind, yet the CHECK only knew
--     about ' ';
--   * an EMPTY domain -- `suppress("user@")` passed the adapter's `lastIndexOf('@') >= 1` guard and
--     then stored ''. `'' = lower(btrim(''))` is true, so the schema accepted it.
--
-- Neither is reachable through the adapter today, which is precisely why the schema must say so:
-- suppression rows are NEVER deleted (the table is a do-not-mail record), so a hand-inserted or
-- future-bounce-feed (#370) row would persist forever, and `domain` is what provider-level triage
-- will group by.
--
-- The severity here is deliberately smaller than the review finding that prompted it: since #388
-- the lookup keys on `email_key`, whose `~ '^v1:[0-9a-f]{64}$'` CHECK already blocks the
-- hand-inserted-cleartext row. `domain` is a triage column, so this is a data-quality fix, not a
-- send-invariant one.
--
-- WHY NOT A BLANKET WHITESPACE BAN. The obvious form -- `domain !~ '[[:space:][:cntrl:]]'` -- is
-- STRICTER than the writer: `Emails.normalize` trims edges only, so an interior space is a value
-- the adapter genuinely can produce (from a junk address). Under a blanket ban that input would
-- stop being a stored row and start being a DataIntegrityViolationException raised on the mail
-- drainer thread. `btrim(domain, <the characters trim() strips>)` mirrors String#trim() exactly, so
-- the schema accepts precisely what the writer emits -- no more, and no less. `[:space:]` is also
-- locale-dependent in Postgres, which would have made the rule differ between environments.
--
-- U+00A0 (NBSP) is NOT covered, deliberately: String#trim() leaves it alone (it only strips
-- <= U+0020), so an NBSP is producible and must stay acceptable for the two sides to agree.
--
-- The replacement constraint is NAMED, unlike V33's inline column CHECK, so no future migration has
-- to guess Postgres's generated `email_suppression_domain_check`.

ALTER TABLE email_suppression DROP CONSTRAINT email_suppression_domain_check;

ALTER TABLE email_suppression
  ADD CONSTRAINT email_suppression_domain_normalized
  CHECK (
    domain <> ''
    AND domain = lower(btrim(domain, E' \t\n\r\f\v'))
  );

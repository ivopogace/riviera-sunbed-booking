-- An SSO identity or recovery token written just after its account's erasure committed outlived it (#1307).
-- Erasure deletes these child rows and their writers lock the live account first; drop any leftover once.
DELETE FROM customer_sso_identity
WHERE account_id IN (SELECT id FROM customer_account WHERE erased_at IS NOT NULL);

DELETE FROM customer_account_token
WHERE account_id IN (SELECT id FROM customer_account WHERE erased_at IS NOT NULL);

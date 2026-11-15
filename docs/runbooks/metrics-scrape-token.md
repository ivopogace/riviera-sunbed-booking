# Metrics scrape token: mint, configure, rotate, revoke

The metrics scraper reads `GET /actuator/prometheus` and health's component details with its own bearer token
([ADR-0032](../adr/ADR-0032-the-metrics-scraper-holds-its-own-bearer-token.md)). The token is never an admin
credential, and an admin session cannot scrape. The server holds only the token's SHA-256. Posture:
[production-hardening.md § Actuator endpoints](../deploy/production-hardening.md#actuator-endpoints).

| Setting | Env var | Holds |
|---|---|---|
| `riviera.observability.scrape-token-sha256` | `RIVIERA_SCRAPE_TOKEN_SHA256` | the current token's SHA-256, 64 hex characters |
| `riviera.observability.scrape-token-sha256-next` | `RIVIERA_SCRAPE_TOKEN_SHA256_NEXT` | the next token's SHA-256, set only during a rotation |

Neither set means every bearer request is `401`: the scrape fails closed. A value that is not 64 hex characters
fails the boot, naming the key.

## Mint

On a trusted machine, never on the server:

```bash
TOKEN="$(openssl rand -hex 32)"
printf '%s' "$TOKEN" | openssl dgst -sha256 -r | cut -d' ' -f1
```

- The first line makes 256 random bits, 64 hex characters. This is the token.
- The second line prints its SHA-256. This is what the server gets. `printf '%s'` matters: a trailing newline
  changes the hash.
- The token goes into the scraper's secret store only. Never commit it, paste it into a ticket, put it on a
  command line or in a URL, or set it as the server's variable. The token and its hash are both 64 hex
  characters, so check you set the hash.

## Configure

1. Set `RIVIERA_SCRAPE_TOKEN_SHA256` to the hash on the backend service, then redeploy.
2. Give the scraper the token from a file.

   Prometheus:

   ```yaml
   scrape_configs:
     - job_name: riviera
       scheme: https
       metrics_path: /actuator/prometheus
       authorization:
         credentials_file: /etc/prometheus/riviera-scrape-token
       static_configs:
         - targets: ["<host>"]
   ```

   Grafana Alloy:

   ```alloy
   local.file "riviera_scrape_token" {
     filename  = "/etc/alloy/riviera-scrape-token"
     is_secret = true
   }

   prometheus.scrape "riviera" {
     targets      = [{"__address__" = "<host>"}]
     scheme       = "https"
     metrics_path = "/actuator/prometheus"
     authorization {
       type        = "Bearer"
       credentials = local.file.riviera_scrape_token.content
     }
     forward_to = [prometheus.remote_write.default.receiver]
   }
   ```

3. Check it: a `200` with `# HELP` lines from `/actuator/prometheus`, and `components` in `/actuator/health`.

## Rotate

The two slots let the old and new token both work, so the scrape never gaps.

1. Mint a new token and hash.
2. Set `RIVIERA_SCRAPE_TOKEN_SHA256_NEXT` to the new hash, then redeploy. Both tokens now work.
3. Switch the scraper to the new token and confirm it scrapes.
4. Move the new hash into `RIVIERA_SCRAPE_TOKEN_SHA256`, clear `RIVIERA_SCRAPE_TOKEN_SHA256_NEXT`, then redeploy.
   The old token is now refused.

Rotate on a schedule, and at once when a scraper host or its secret store changes hands.

## Revoke

Clear the variable holding the leaked token's hash, then redeploy. No session or token row exists, so nothing
else needs ending. Clearing both slots stops all scraping until a new token is minted.

## Diagnose a refusal

A refused credential logs `Refused an actuator credential on <METHOD> <path>` at `WARN`. The line names no token
and no header. Check these causes in order:

- the scraper sends the hash instead of the token;
- the server holds the token instead of the hash;
- a trailing newline was hashed;
- the deploy carrying the new hash hasn't gone live (`/actuator/info` shows the running commit).

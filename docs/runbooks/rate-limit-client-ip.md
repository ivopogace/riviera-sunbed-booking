# Runbook — verifying rate-limit client-IP resolution

**Owns:** the question *"is the rate limiter keying on the client, or on something else?"*
**Applies to:** the deployed backend at <https://riviera-sunbed-booking.onrender.com>
(Render service `srv-d904jdbtqb8s73fera5g`).
**History:** issue #56 (the limiter) → #129 (trusted-proxy walk) → **#286** (this runbook).

## Why this runbook exists at all

The rate limiter has been silently wrong twice, and **no unit or slice test can catch the
failure class**: those tests construct the proxy chain they then assert on, so the shape of
the *real* chain is precisely the thing they cannot verify. #129 shipped with three green
gates on a resolver that keyed on the wrong hop. **The probe below is the only end-to-end
check we have** — treat a green build as saying nothing about this.

The deployed topology is:

```
client → Cloudflare edge → Render → app
```

`*.onrender.com` is Cloudflare-fronted (responses carry `Server: cloudflare`, `CF-RAY`).
Render appends *its* peer — the Cloudflare edge node — to `X-Forwarded-For`, and that
address is public and **varies per request** as a client is load-balanced across the CDN.

Since #286 the app prefers `CF-Connecting-IP` (name configurable via
`riviera.ratelimit.client-ip-header`), which Cloudflare **generates** from the connection it
terminated rather than appending to a client-supplied copy. It is read **only when the
socket peer is trusted**, so it cannot be forged by a direct caller, and it needs no chain
walk — which is what keeps Cloudflare's own published ranges out of
`riviera.ratelimit.trusted-proxies`.

## The probe

One client, **constant** `X-Forwarded-For`, against the operator login (cap **10/min**):

```bash
seq 1 200 | xargs -P 40 -I{} curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://riviera-sunbed-booking.onrender.com/api/auth/operator/login \
  -H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.205" \
  -d '{"username":"probe","password":"wrong"}' | sort | uniq -c
```

| Result | Reading |
|---|---|
| **~10–11 non-`429`**, rest `429` | **PASS** — one bucket per client. (An 11th allowed request is refill: 10 tokens/min ≈ 0.17/s over the ~30 s burst, not a second bucket.) |
| **~140 non-`429`** | **FAIL** — roughly 14 buckets for one client: the key is the rotating edge node, not the client. |
| **0 `429` at any size** | The limiter is off, or the burst was too small — see below. |

> **Size the probe to the failure mode. Small bursts are worse than useless.** 14, 25 and 60
> requests all fit *inside* the ~14-way edge fan-out and produce **zero** `429`s. That is
> exactly the measurement that produced the original (wrong) "the limiter is disabled"
> diagnosis in #286. Use 200, concurrent.

The probe deliberately consumes the operator-login budget for its own client IP for about a
minute. It creates no data and authenticates nothing (`probe` is not an account).

## Reading the app's own signal

`ClientIpResolver` logs **once per process** at `WARN` when a client-IP header is configured
but unusable behind a trusted peer:

```
Client-IP header 'CF-Connecting-IP' is absent behind a trusted proxy peer; falling back to
the X-Forwarded-For walk. Rate-limit buckets may be keyed per edge node rather than per
client — see docs/runbooks/rate-limit-client-ip.md
```

Variants: `arrived more than once` (a client-supplied copy survived alongside the edge's —
the header is discarded wholesale rather than guessing which is which) and `is not a single
IP literal`.

Two limits worth knowing: it fires **at most once per process**, so a benign first anomaly
consumes the latch and a later genuine breakage is silent; and it is expected on **every**
local-dev and test JVM, where no CDN is in front. **The WARN is a hint; the probe is the
check.**

## Configuration

| Setting | Env override | Shipped default |
|---|---|---|
| `riviera.ratelimit.client-ip-header` | `RIVIERA_RATELIMIT_CLIENT_IP_HEADER` | `CF-Connecting-IP` |
| `riviera.ratelimit.trusted-proxies` | `RIVIERA_RATELIMIT_TRUSTED_PROXIES` | loopback + RFC1918 + link-local + IPv6 equivalents (8 CIDRs) |

The trust list has exactly one job now: **classify the socket peer**, which on Render is an
internal private-range hop. It is deliberately *not* a list of the CDN's addresses.

Setting `RIVIERA_RATELIMIT_CLIENT_IP_HEADER` to empty disables the preferred path and falls
back to the #129 `X-Forwarded-For` walk. Setting `RIVIERA_RATELIMIT_TRUSTED_PROXIES` to empty
is the kill switch: no peer is trusted, every forwarding header is ignored, and the socket
address is the key.

## Retiring the Cloudflare CIDR stopgap (#286, one-time)

Between #129 and #286, `RIVIERA_RATELIMIT_TRUSTED_PROXIES` was set on Render to the 8
shipped defaults **plus Cloudflare's 15 IPv4 + 7 IPv6 published ranges** (30 CIDRs, fetched
from <https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6> on
2026-07-22). That made the walk skip the edge and land on the client — correct, but it made
correctness depend on a hand-copied third-party list that rots with no signal.

Retire it in **two steps**, in this order:

1. **Deploy the #286 code with the env var still set.** Run the probe: expect ~10 non-`429`.
   This proves no regression. It **cannot** prove the header path works — while Cloudflare's
   ranges are trusted, the walk and the header resolve to the *same* key, so a silently
   broken header path still passes.
2. **Unset `RIVIERA_RATELIMIT_TRUSTED_PROXIES`** so only the shipped private ranges are
   trusted, wait for the restart, and re-run the probe. **This is the discriminating test:**
   - ~10 non-`429` ⇒ the header path is confirmed; the CIDR list is retired for good.
   - ~140 non-`429` ⇒ the header path is inert (Render is not forwarding the header).
     **Roll back by re-setting the env var to the 30-CIDR value**, then reopen #286 with the
     measurement.

Do not skip step 1. It keeps a correct fallback in place while the new code is proven.

## Related

- `docs/deploy/cd-pipeline.md` — the deployed environment variables.
- `docs/deploy/production-hardening.md` — the forward-headers posture.
- `docs/plans/issue-286-durable-client-ip.md`, `docs/plans/issue-129-trusted-proxy-rate-limit.md`.

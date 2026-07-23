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

Since #286/#287 the app prefers `CF-Connecting-IP` (name configurable via
`riviera.ratelimit.client-ip-header`), which Cloudflare **generates** from the connection it
terminated rather than appending to a client-supplied copy. It is read **only when the
socket peer is trusted**, so it cannot be forged by a direct caller, and it needs no chain
walk.

> **Measured correction (2026-07-22) — read before changing `trusted-proxies`.** The header
> was expected to make Cloudflare's published ranges unnecessary. **It does not**, because
> **the socket peer this app sees is itself a Cloudflare edge address, not a private Render
> hop.** The trust gate in front of *every* forwarding header — the client-IP header
> included — therefore still needs those ranges to classify the peer.
>
> Evidence: with only the private ranges trusted, the probe returned **166 of 200 allowed**
> (~17 buckets) and the resolver logged **no WARN at all** — meaning `resolve` returned at its
> first branch (`peer not trusted`) and never reached the header. With Cloudflare's ranges
> restored: 11 of 200. An earlier note asserting the peer was private was an incorrect
> inference; the peer was trusted because those ranges had just been added.
>
> **`RIVIERA_RATELIMIT_TRUSTED_PROXIES` must stay set.** #286 remains open for the durable
> answer to the drift risk.

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

The trust list has exactly one job now: **classify the socket peer** — down from two, since
the header path removes the chain walk. But on this deployment that peer is a **Cloudflare
edge address** (measured above), so the list must still contain the CDN's ranges. That is the
open half of #286.

Setting `RIVIERA_RATELIMIT_CLIENT_IP_HEADER` to empty disables the preferred path and falls
back to the #129 `X-Forwarded-For` walk. Setting `RIVIERA_RATELIMIT_TRUSTED_PROXIES` to empty
is the kill switch: no peer is trusted, every forwarding header is ignored, and the socket
address is the key.

## The Cloudflare CIDR stopgap — **attempted retirement, 2026-07-22: FAILED and rolled back**

`RIVIERA_RATELIMIT_TRUSTED_PROXIES` is set on Render to the 8 shipped defaults **plus
Cloudflare's 15 IPv4 + 7 IPv6 published ranges** (30 CIDRs, fetched from
<https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6> on 2026-07-22).

The two-step retirement below was run after #287 deployed. **Step 2 failed**, and the
procedure is kept here because it is still the right *method* — it is what caught the false
premise, and it is what a future attempt must re-run.

1. **Deploy with the env var still set.** Probe: expect ~10 non-`429`. Proves no regression.
   It **cannot** prove the header path works — while Cloudflare's ranges are trusted, the
   walk and the header resolve to the *same* key, so a broken header path still passes.
   *Result 2026-07-22: 11 of 200. ✅*
2. **Narrow `RIVIERA_RATELIMIT_TRUSTED_PROXIES` to the private ranges only**, wait for the
   restart, re-probe. **This is the discriminating test:**
   - ~10 non-`429` ⇒ the header path is confirmed; the CIDR list can be retired.
   - ~140+ non-`429` ⇒ the header path is inert. **Roll back to the 30-CIDR value**, then
     reopen #286 with the measurement.
   *Result 2026-07-22: **166 of 200 (~17 buckets) — FAILED.** Rolled back the same minute;
   re-probed at 11 of 200. Cause: the socket peer is a Cloudflare address, so narrowing the
   list made the peer itself untrusted and the resolver never reached the header.*

**Diagnostic tip that paid off:** check the resolver's WARN *first*. Its **absence** during a
failing probe is the tell that the peer is untrusted — a present WARN would instead mean the
peer was fine and the header was missing. (#286 tracks adding an explicit warning for the
untrusted-peer-with-header case, so this no longer has to be deduced from silence.)

## Related

- `docs/deploy/cd-pipeline.md` — the deployed environment variables.
- `docs/deploy/production-hardening.md` — the forward-headers posture.
- `docs/plans/issue-286-durable-client-ip.md`, `docs/plans/issue-129-trusted-proxy-rate-limit.md`.

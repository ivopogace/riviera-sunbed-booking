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

Since **#290** there is a fourth, opposite signal — the one that actually fingerprints
**trust-list rot**:

```
Client-IP header 'CF-Connecting-IP' arrived from an UNTRUSTED socket peer and was ignored
(bypass closure #129). This is the fingerprint of the trusted-proxy list missing the
upstream edge's ranges — see docs/runbooks/rate-limit-client-ip.md
```

The three variants above all fire behind a **trusted** peer (the header path was reached but
unusable). This one fires on the *other* branch: the socket peer was **not** trusted, so
`resolve` returned at its first branch and the header was (correctly) ignored — yet the
header was present, which is exactly what happens when Cloudflare adds a range that
`RIVIERA_RATELIMIT_TRUSTED_PROXIES` no longer covers, so the CDN edge is no longer classified
as trusted. **Seeing this WARN on the deployed app means the trust list has drifted: apply
the refresh procedure below.** (It is *absence* of any WARN during a failing probe that told
the same story before #290 — see the diagnostic tip in the retirement record.)

Two limits worth knowing: each WARN fires **at most once per process**, so a benign first
anomaly consumes the latch and a later genuine breakage is silent; and the trusted-peer
variants are expected on **every** local-dev and test JVM, where no CDN is in front. The
untrusted-peer variant, by contrast, does **not** fire locally or in the IT corpus — their
peers are loopback, which *is* trusted — so on the deployed app it is a specific tell, not
background noise. **The WARN is a hint; the probe is the check.**

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

## Refreshing the Cloudflare ranges

Until #291 replaces IP-based peer trust with a cryptographic upstream check, the Cloudflare
portion of `RIVIERA_RATELIMIT_TRUSTED_PROXIES` is a **hand-maintained copy of a third-party
list**. Cloudflare adds ranges from time to time; when they do, the new edge nodes stop being
classified as trusted, `resolve` returns at its first branch, and the rate limiter silently
falls back to keying on the per-request-varying edge — the #286 defect, returning. The **#290
untrusted-peer WARN** (above) is the trigger to run this: it names the drift on the first
affected request instead of leaving it to be deduced from a failing probe.

**When to run:** on seeing the untrusted-peer WARN in Render logs; or as a periodic hygiene
check; or whenever the probe regresses to a high non-`429` count with the env var still set.

1. **Re-fetch Cloudflare's published ranges** (the same two sources the current value came
   from — `docs/deploy/cd-pipeline.md` records the provenance and the 2026-07-22 fetch):

   ```bash
   curl -s https://www.cloudflare.com/ips-v4 -o /tmp/cf-v4.txt
   curl -s https://www.cloudflare.com/ips-v6 -o /tmp/cf-v6.txt
   cat /tmp/cf-v4.txt /tmp/cf-v6.txt   # 15 IPv4 + 7 IPv6 = 22 CIDRs as of 2026-07-22
   ```

2. **Diff against what is deployed.** The env var is the **8 shipped private/loopback CIDRs
   plus** Cloudflare's ranges; only the Cloudflare portion is under review here. Pull the
   current value from the Render service (`srv-d904jdbtqb8s73fera5g`) and compare its
   Cloudflare CIDRs, comma-separated, against the freshly fetched set — a line-by-line
   `comm`/`diff` of the two sorted lists shows any **added** range (must be appended) or
   **removed** one (safe to drop). Never remove the 8 private defaults; they classify Render's
   own internal hop.

3. **Update the env var** to `<8 private defaults>,<current Cloudflare list ∪ new ranges>`
   (keep the private ranges first, matching `application.properties`), redeploy, and wait for
   the restart. The colon-bearing IPv6 defaults (`::1/128`, `fc00::/7`, `fe80::/10`) and any
   IPv6 Cloudflare ranges must survive intact — a dropped or mangled CIDR silently weakens the
   control.

4. **Re-run [the probe](#the-probe)** with the env var set → expect ~10–11 non-`429`. This
   confirms the refreshed list once again classifies the edge as trusted. The untrusted-peer
   WARN should not reappear for a client whose edge is now covered (subject to the
   once-per-process latch — a fresh deploy resets it).

> **Do not automate this fetch into the app** (startup or scheduled). Rejected in #286's
> plan: it trades silent rot for a startup network dependency and a supply-chain input to a
> security control. The durable fix is #291 (authenticate the upstream edge cryptographically
> so peer trust stops being an IP list), not a faster copy.

## Related

- `docs/deploy/cd-pipeline.md` — the deployed environment variables.
- `docs/deploy/production-hardening.md` — the forward-headers posture.
- The slices that built it: #129, then #286.

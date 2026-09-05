# Contributor onboarding — authorizing someone to contribute

`LICENSE` §5 accepts contributions **only from people the Owner has authorized**, and §3
forbids anyone from cloning or modifying the Software without the Owner's written
permission. So a would-be contributor needs two things from the Owner before writing a
line: a written authorization that also grants the working permission, and their
acceptance of the [`CLA.md`](../../CLA.md). This runbook is the Owner's checklist and the
message to send.

## Checklist

1. **Decide.** Unsolicited PRs from anyone not yet authorized are closed unmerged, not
   reviewed, so no code is taken under unclear terms.
2. **Send the authorization message** below. It grants the limited working permission
   (`CLA.md` §6), names the scope, and asks for the two confirmations.
3. **Collect acceptance before any work starts.** Either the exact GitHub comment in
   `CLA.md` §13 on their first PR, or the signed block. Require the **signed** form for any
   substantial or ongoing contributor, and for anyone outside a jurisdiction where a
   click-through is reliably enforceable. File the record.
4. **Clear the employer question.** If an employer, client, or university could claim their
   work, get that party's written release first. This is the most common way an assignment
   fails.
5. **Grant access.** Collaborator access to the repo, or accept fork PRs. Either way the
   `Riviera Rule Set` still gates `main` on the seven required checks.
6. **On every PR** the "Contribution terms" checkbox in the PR template must be ticked and
   any third-party material named with its licence. Review as usual (`riviera-sdlc`).
7. **Attribution is the Owner's call.** No credit is owed (`CLA.md` §5), but git records the
   commit author. For no attribution at all, squash-merge with the Owner as the author of
   the squash commit.
8. **Ending it.** Withdraw the authorization in writing; the working permission ends with it
   and the contributor deletes their copies on request (`CLA.md` §6). Everything already
   submitted stays the Owner's (`CLA.md` §11).

## Authorization message (template)

Send by email or GitHub DM. Replace the bracketed parts; keep the rest.

```
Subject: Contributing to Riviera Sunbed Booking — authorization and terms

Hi [NAME],

Thanks for offering to contribute to Riviera Sunbed Booking. The repository is
proprietary and everything in it is my property, so before you write anything I
need to authorize you in writing and you need to accept the contribution terms.

1. Authorization. I authorize you to contribute to
   https://github.com/ivopogace/riviera-sunbed-booking, limited to:
   [SCOPE — e.g. "issue #NNN", "the frontend booking flow", "review comments only"].
   For that purpose only, I permit you to clone, fork, build, run, and modify the
   software. This permission is personal to you, is not transferable, and I may
   withdraw it at any time in writing. When it ends, please delete your local and
   forked copies.

2. Terms. Everything you contribute becomes my property the moment you submit it.
   You keep no rights in it, including the code you write; no licence back, credit,
   or payment is owed unless I agree to it separately in writing. The full terms are
   section 5 of the LICENSE and the Contributor Assignment Agreement in CLA.md:
   https://github.com/ivopogace/riviera-sunbed-booking/blob/main/LICENSE
   https://github.com/ivopogace/riviera-sunbed-booking/blob/main/CLA.md

3. What I need back before you start. Please reply to this message with:
   a. "I have read the Contributor Assignment Agreement (CLA.md, version 1.0) and I
      agree to it. My full legal name is ______."
   b. Confirmation that no employer, client, or school has a claim to work you do for
      this project — or, if one might, their written release attached.
   [c. The signed acceptance block from CLA.md §13, if you would rather sign — I will
      ask for the signed form for anything beyond a small fix.]

4. How we work. CONTRIBUTING.md covers setup, branching, and the review gates. Each
   PR has a "Contribution terms" checkbox that must be ticked, and any third-party
   code or dependency you add must be named with its licence in the PR.

If any of this doesn't work for you, no hard feelings — just don't start on the code.

Best,
Ivo Pogace
```

# Tourist header prototype — screenshot helpers (throwaway, spike branch only)

Renders every `?variant=` header candidate from `src/app/prototype-header/` against a mocked API,
signed out and signed in, in the three themes, at 1280px and 390px.

```bash
cd frontend
npm start &                       # dev server on :4200
node prototype-shots/shoot.mjs /tmp/header-shots     # one PNG per view
node prototype-shots/sheet.mjs /tmp/header-shots     # comparison-efg.png contact sheet (edit rows in the file)
```

Edit the `shoot({ … })` calls at the bottom of `shoot.mjs` for other views (`open: 'account' | 'menu'`,
`bottom: true` clips the bottom 200px for the tab-bar variants).

## The page-context pass

`shoot.mjs` only ever renders the landing page, which flatters every candidate equally. The four
surfaces that actually discriminate between them are the beach map, the find-a-booking modal,
sign-in and the pay page — a header that reads well over an empty hero can still fight the
`Pay €45` button or invite the guest to leave mid-payment.

```bash
node prototype-shots/shoot-pages.mjs /tmp/header-shots            # 6 views × every variant
node prototype-shots/shoot-pages.mjs /tmp/header-shots map-phone  # just one view
VARIANTS=current,c,h node prototype-shots/sheet-pages.mjs /tmp/header-shots   # one sheet per view
```

`VARIANTS` narrows either script to a subset; `SHEET=<prefix>` renames `sheet-pages.mjs`'s output so
a focused comparison doesn't clobber the full set. The pay view drives the real booking dialog to
reach `/booking/pay` (a direct visit renders only the empty state) behind the deterministic fake
Stripe gateway.

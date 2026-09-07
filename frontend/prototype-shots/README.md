# Console nav prototype — screenshot helpers (throwaway, spike branch only)

Renders every `?variant=` console-nav candidate from `src/app/prototype-console-nav/` against a
mocked API, signed in as an operator who is also the platform admin and owns two venues, at
1280px and 390px, on the surfaces that discriminate between the candidates.

```bash
cd frontend
npm start &                                              # dev server on :4200
node prototype-shots/shoot-console.mjs /tmp/nav-shots    # 12 views × 6 variants, one PNG each
node prototype-shots/shoot-console.mjs /tmp/nav-shots beach-map   # just one view
node prototype-shots/sheet-console.mjs /tmp/nav-shots prototype-shots/console   # one sheet per view
```

`VARIANTS` narrows either script; `THEME=dark` shoots the shipped chrome under the OS-dark theme
(the seam check between `app-operator-chrome` and the porcelain-pinned consoles);
`SHEET=<prefix>` renames the sheets so a focused comparison doesn't clobber the full set.

The views: `daily`, `beach-map` (the layout editor wants both axes), `requests` (time-critical,
its own primary actions), `admin` and `audit` (first and last admin tab — the overflow case),
`landing` (`/operator` with two venues → the picker), `admin-out` (a signed-out admin tab — the
strip must not render), and the phone twins of daily, requests, beach map, admin and audit.

`prototype-shots/console/` holds the committed contact sheets; the individual shots stay out of
the repo.

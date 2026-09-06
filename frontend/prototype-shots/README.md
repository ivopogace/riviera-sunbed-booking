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

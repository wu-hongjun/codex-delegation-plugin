# Documentation site

This directory contains the static landing page and documentation site deployed to GitHub Pages.

```bash
npm run site:build
npm run site:check
npm run site:test:commands
npm run site:serve
```

The build wraps HTML fragments from `website/pages/` in shared semantic navigation, injects the
current plugin version and generated command references, then writes the ignored `_site/` artifact.
There is no client JavaScript or React runtime.

## Design-system build

`wu-hongjun/vvver-design-system` is pinned as a submodule under `vendor/`. Tailwind CSS 4 compiles
the design system's real `tokens.css`, `styles.css`, and `prose.css` together with the small
product-specific host stylesheet. The build also copies the bundled Switzer WOFF2 fonts. See
[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) for the exact audited version and adoption decisions.

The private cross-repository checkout uses a dedicated read-only deploy key stored as the Actions
secret `DESIGN_SYSTEM_DEPLOY_KEY`. The public half is registered only on the design-system
repository; the private half is available only to this repository's Pages workflow.

## Content and deployment

- `website/pages/` owns semantic page fragments.
- `website/site.config.mjs` owns routes, titles, canonical URLs, and navigation order.
- `website/command-catalog.mjs` owns generated skill and dispatcher reference data.
- `website/public/` owns static metadata and the Tailwind input stylesheet.
- `tools/site/` owns generation, validation, command smoke tests, and the local server.

`npm run site:check` validates links, heading order, landmarks, table semantics, keyboard-scroll
targets, compiled CSS contracts, local fonts, and Pages-specific error behavior. GitHub Actions
builds and verifies `_site/`, uploads it as the Pages artifact, and deploys it from `main`.

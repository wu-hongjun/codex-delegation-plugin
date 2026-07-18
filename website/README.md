# Documentation site

This directory contains the content-first landing and documentation site for GitHub Pages.

```bash
npm run site:build
npm run site:check
npm run site:test:commands
npm run site:serve
```

The build wraps HTML fragments from `website/pages/` in shared semantic navigation and layout, injects
the current plugin version and generated command references, then writes the ignored `_site/`
artifact. Presentation is a single self-contained stylesheet under `website/public/assets/`; there
is deliberately no inline style, client JavaScript, React, Tailwind, or private build dependency.

## Design-system boundary

The design-system audit and adoption record lives in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).
`wu-hongjun/vvver-design-system` is pinned as a submodule under `vendor/`. The build copies its real
`tokens.css` and framework-neutral `prose.css` into the Pages artifact; `site.css` supplies only the
host palette and documentation shell required by the design-system contract.

The private cross-repository checkout uses a dedicated read-only deploy key stored as the Actions
secret `DESIGN_SYSTEM_DEPLOY_KEY`. The public half is registered only on the design-system
repository; the private half is available only to this repository's workflow.

When the site needs interactive components:

1. Update the submodule deliberately and record the reviewed commit.
2. Adopt a React-capable static export only when the component system is actually needed.
3. Map the shared shell and semantic content elements into design-system components.
4. Keep content and command validation independent from presentation.

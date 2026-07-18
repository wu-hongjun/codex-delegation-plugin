# Design-system adoption record

Audit date: 2026-07-17

Source: `wu-hongjun/vvver-design-system`

- Package release: `v0.4.0`
- Audited `main`: `6ff1be157d055a6d7f8a152ed327daeba2abf70a`
- Package shape: source TypeScript, React 19 peer dependency, Tailwind CSS 4 host contract
- Integration: pinned submodule at `vendor/vvver-design-system`
- Portable layer used directly: `src/tokens.css` and `src/prose.css`

## Findings

The system has matured substantially since the initial site scaffold. It now contains roughly 80
components across actions, typography, structure, forms, feedback, overlays, media, motion, and
hooks. The post-v0.4.0 work also adds a dedicated long-form prose and code layer, focus and disabled
state polish, dark-mode corrections, hydration guidance, and reduced-motion fallbacks.

The site uses a submodule rather than a package-manager dependency for two reasons:

1. The Pages workflow can authenticate the private cross-repository checkout with a dedicated
   read-only deploy key while keeping the exact source commit visible in this repository.
2. Components are source-shipped React/Tailwind, but `prose.css` is deliberately framework-neutral.
   The build can consume that real asset without introducing React solely for documentation chrome.

## Adopted in this site

- warm monochrome ink/paper palette and secondary surface
- shared easing, dimming, hairline, and viewport-rhythm tokens
- single-face editorial hierarchy with uppercase display and micro-label roles
- 68-character reading measure and generous section rhythm
- squared list markers, code surfaces, and controls
- hairline table, navigation, and section structure
- visible keyboard focus and an immediate first-tab skip link
- horizontal containment for wide tables and code
- self-dimming hover language and reduced-motion fallback
- responsive two-column documentation shell with a sticky local index on wide screens

The design-system assets are copied byte-for-byte from the pinned submodule into the generated Pages
artifact. A small local stylesheet defines the host palette and site-specific header, navigation,
documentation grid, and footer. It does not duplicate the system's prose, code, table, or token
implementations.

## Upstream follow-ups found by the audit

The post-v0.4.0 prose work is present on `main`, but the package export map does not yet expose
`./prose.css`, and the public TypeScript index does not export `Prose`, `CodeBlock`, `InlineCode`, or
`markdownComponents`. This site reads the pinned files from the submodule, so it is not blocked, but
a future package-manager consumer would be. Add those exports in the next design-system release.

## Revisit when

Consider a package-manager dependency after the missing prose/component exports ship and the site
has a concrete need for interactive React components. At that point, map the existing semantic shell
to `SkipLink`, `Prose`, `CodeBlock`, `Breadcrumbs`, `IndexTable`, and related components; keep the
HTML content fragments and command validation independent of presentation.

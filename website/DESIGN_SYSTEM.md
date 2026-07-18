# Design-system adoption record

Audit date: 2026-07-18

Source: `wu-hongjun/vvver-design-system`

- Package release: `v0.7.2`
- Pinned commit: `715158c064deefaffc56276e90d69a52feecdbd2`
- Package shape: source TypeScript, React 19 peer dependency, Tailwind CSS 4 host contract
- Integration: exact submodule gitlink at `vendor/vvver-design-system`
- Static-site inputs: `src/tokens.css`, `src/styles.css`, `src/prose.css`, and Switzer WOFF2 files

## Audit outcome

The site now compiles the complete portable design-system CSS stack through Tailwind 4. It no
longer copies two raw CSS files and recreates most of the visual language in a local stylesheet.
The host layer is limited to the warm monochrome palette, product-specific composition, and the
semantic static documentation shell.

Version 0.7.2 adds the responsive contract the site needed: fluid display and heading scales,
fluid gutters, 44-pixel tap targets, dynamic-viewport and safe-area utilities, scroll containment,
and a broader set of page and navigation recipes. It also exports `prose.css`, `Prose`, `CodeBlock`,
`InlineCode`, and `markdownComponents`; the missing-export findings from the v0.4.0 audit are closed.

## Adopted directly

- the full token, component-class, utility, and prose stylesheets
- bundled Switzer 400, 500, and 700 WOFF2 fonts with `font-display: swap`
- `--fluid-display`, heading and lede scales, `--gutter-fluid`, and viewport rhythms
- `--tap-min` through the real `.tap-target` utility
- `.link-slide`, `.underlined-link`, `.touch-scroll`, hairlines, dimming, and motion contracts
- prose, code-block, table, focus, reduced-motion, and monochrome syntax registers
- documentation layout recipes: 200-pixel rail, 60-pixel gap, constrained reading column, sticky rail
- component patterns for release information, previous/next navigation, and editorial index rows

The generated Pages artifact contains one minified stylesheet and local font files. The checker
requires compiled output (no remaining `@import` or `@apply`), verifies design-system contract
tokens/classes, and byte-compares every copied font against the pinned source.

## Deliberate static adaptations

The site remains HTML and CSS only. React is not needed for a content-first landing page and
documentation renderer, so component markup patterns are translated into semantic static HTML
while their real CSS/tokens remain upstream-owned. This keeps the content generator small and makes
GitHub Pages deployment deterministic.

The upstream `NavBar` was not adopted in this pass. Its closed mobile overlay stays mounted with
focusable descendants under an `aria-hidden` container and does not yet provide the full inert/focus
trap behavior expected of a modal navigation surface. The site therefore uses an always-visible,
responsive navigation built from normal links and the design system's `tap-target` and `link-slide`
utilities. Reassess this when the upstream component fixes that accessibility gap.

## Upstream/package boundaries

- `styles.css` contains Tailwind `@apply`; consumers must compile it rather than copy it raw.
- The npm package intentionally excludes the documentation shell and its font files. This site reads
  both from the pinned source submodule.
- The design-system documentation toolchain currently has moderate audit findings in Next/PostCSS;
  they do not enter this site's static Tailwind build or deployed artifact.

## Updating

1. Fetch tags and inspect the newest release notes and package exports.
2. Move the submodule to an exact reviewed tag/commit.
3. Re-run `npm run site:test`, the viewport/keyboard audit, and the repository validation lanes.
4. Update this record with the adopted version, commit, and any unresolved component findings.

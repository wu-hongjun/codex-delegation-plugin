# Design-system adoption record

Audit date: 2026-07-18

Source: `wu-hongjun/vvver-design-system`

- Package release: `v0.8.1`
- Pinned commit: `0116bd45184c08453b8fb850292e94c39ef43583`
- Package shape: source TypeScript, React 19 peer dependency, Tailwind CSS 4 host contract
- Integration: exact submodule gitlink at `vendor/vvver-design-system`
- Static-site inputs: `src/tokens.css`, `src/styles.css`, `src/prose.css`, and Switzer WOFF2 files

## v0.8.1 audit outcome

Version 0.8.1 adds 28 components and raises the library from roughly 110 to roughly 140 components.
The major addition for this repository is a complete page-section tier: `Hero`, `Section`,
`SectionHeading`, `FeatureGrid`, `FeatureRow`, `BentoGrid`, `StatBand`, `CTASection`, `Footer`,
`AnnouncementBar`, `FAQ`, `LogoWall`, `PricingTable`, `Testimonial`, `NewsletterSection`, and
`NewsList`. It also adds dashboard and icon families and publishes a full product-landing reference
composition.

The optional companion accent contract introduces eight muted, low-chroma host tints. This site
defines the documented values and uses only sage, slate, and sand for status marks, provider rules,
and the release strip. Core surfaces remain ink and paper.

The tagged design-system documentation build succeeds across all 32 static routes. The upstream
documentation toolchain reports two moderate development-only advisories through Next/PostCSS;
neither package enters this site's static Tailwind artifact. The plugin repository's own audit
remains separate and must stay at zero.

## Adopted in the second pass

- `Hero` split-layout proportions, fluid display type, lede measure, and action spacing
- `Section` full-bleed/contained rhythm and safe-area gutter contract
- `SectionHeading` eyebrow, title, lede, and trailing-action hierarchy
- `FeatureGrid` interior hairline structure without perimeter card boxes
- `FeatureRow` two-column copy/product-surface composition
- `BentoGrid`-style provider panels with restrained tint marks
- `StatBand` source order, figure scale, stacked mobile rules, and desktop separators
- inverted `CTASection` hierarchy and action treatment
- responsive `Footer` masthead, link groups, and legal row
- `AnnouncementBar` micro-register for the current release
- `PageHeader` proportions for documentation titles and ledes

The landing page is no longer wrapped in `.vvver-prose`. Prose is intentionally scoped to
documentation and error content; the product page uses the new section recipes. This removes the
specificity fight that previously forced editorial article headings, margins, and table rules onto
the landing composition.

## Build boundary

The site remains static HTML and CSS. Tailwind 4 compiles the real design-system tokens, component
classes, utilities, and prose styles with the host composition into one minified stylesheet. The
build copies the upstream Switzer 400, 500, and 700 WOFF2 files byte-for-byte. There is no client
JavaScript or React runtime in the deployed Pages artifact.

React page blocks are translated into semantic static markup because their presentation is
slot-based and does not require hydration. The implementation follows the upstream product-landing
example and component recipes rather than recreating an unrelated visual language. Stateful
components remain upstream-owned and should only be adopted with their real React behavior.

## Navigation finding

The v0.7.2 audit found that the closed mobile `NavBar` overlay kept focusable descendants mounted
under `aria-hidden`. v0.8.1 fixes this with `inert`, adds safer overflow/wrapping, and improves the
mobile curtain. That finding is closed. This static site still uses always-visible navigation
because three links fit without a menu or client runtime; adopt the real `NavBar` if the information
architecture grows enough to require an overlay.

## Updating

1. Fetch tags and inspect the newest release diff, package exports, new page recipes, and audit fixes.
2. Move the submodule to an exact reviewed tag/commit.
3. Build the tagged design-system documentation workspace.
4. Run `npm run site:test`, the responsive/keyboard contract audit, and all repository lanes.
5. Update this record with the adopted version, commit, and any unresolved component findings.

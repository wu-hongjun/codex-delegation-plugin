# Design-system adoption record

Audit date: 2026-07-18

Source: `wu-hongjun/vvver-design-system`

- Package release: `v0.10.1`
- Pinned commit: `53ee8b66a243efdbeb61bd6ffb5a94bb2d1d3db5` (`origin/main`, post-release)
- Package shape: source TypeScript, React 19 peer dependency, Tailwind CSS 4 host contract
- Integration: exact submodule gitlink at `vendor/vvver-design-system`
- Static-site inputs: `src/tokens.css`, `src/styles.css`, `src/prose.css`, and Switzer WOFF2 files

## v0.10.1 and post-release audit outcome

Versions 0.9.0 and 0.10.0 raise the library to roughly 150 components. The new account and security
kit is not needed by this documentation site, but its field, status, and consent patterns informed
the same quiet interactive-weight treatment used here. Version 0.10.0 exposes `Wordmark` and the
active-link state in `NavBar`, and reorganizes the component documentation into fourteen
primitive-based families. The pinned commit also includes the post-release prose fix that prevents
`Quote` figures from inheriting markdown blockquote spacing.

Version 0.10.1 follows with accessibility corrections: small dimmed labels return to readable ink,
status labels no longer inherit accent color, nested syntax tokens keep AA-clearing contrast, and
the `Quote` reset is narrowed so ordinary image figures retain their prose spacing. This site's own
microcopy audit follows the same contrast rule.

The reviewed post-release mainline adds `ProjectLedger`, `WorkIndex`, `MediaSequence`, `ProofFrame`,
`MaterialTexture`, and a documentary `typewriter-register`. More importantly, it consolidates the
system's anti-synthetic doctrine: factual metadata and authored evidence create human character;
uniform cards, fake terminal records, invented provenance, and global texture do not.

The optional companion accent contract introduces eight muted, low-chroma host tints. This site
defines the documented values and uses only sage, slate, and sand for status marks, provider rules,
and the release strip. Core surfaces remain ink and paper.

The site consumes the reviewed post-v0.10.1 mainline artifact. Its documentation app builds all 32
routes successfully. The upstream workspace's audit reports two moderate development-only findings
through Next's pinned PostCSS; neither package enters this site's static Tailwind artifact. The
plugin repository's audit remains separate and must stay at zero.

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

## Adopted in the third pass

- the v0.10 `Wordmark` mark/label relationship, translated into a static lockup without adding a
  React or client-JavaScript boundary
- `NavBar` active-link semantics across every documentation route, including `aria-current="page"`
  and a quiet baseline rather than a bold weight jump
- compact release-strip language and directional affordance from the navigation family
- primitive-family thinking in the landing page: provider content reads as a comparison field,
  release checks read as a ledger, and the final action reads as a sequence instead of a collection
  of interchangeable cards
- the current prose fix for nested `Quote` figures

This pass deliberately removes common generated-landing-page signals: equal card grids as the
default answer to every content group, oversized vanity metrics, a centered closing banner, and an
invented `CD//` wordmark. The remaining details are restrained—an asymmetric hero, running section
labels, tabular release evidence, hairline active states, and a single low-chroma status register.

## Adopted in the fourth pass

- `ProjectLedger`'s open, fixed-track treatment for the hero's factual job provenance
- the documentary `typewriter-register` for the recorded verification source and date
- v0.10.1's 0.62rem readable micro-label floor across product, provider, proof, and sequence labels
- the canonical circular geometry for semantic status dots while brand surfaces remain square
- the self-dimming interaction rule for buttons, documentation navigation, and footer links
- ink-on-paper selection inherited directly from the upstream base layer

The hero record now uses the real bounded Qwen verification session, provider, completion state,
date, and exact `QWEN_EXACT_RESUME_OK` result. The one-shot and follow-up were run without tools,
and the follow-up resumed the captured session ID rather than global continuation state. Invented
metadata and permission claims remain excluded. `MaterialTexture` and `ProofFrame` were
intentionally not applied: this site has no authored physical media or production scan whose
provenance would justify them, and a global paper effect would reproduce the synthetic look this
pass is meant to remove.

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
under `aria-hidden`. v0.8.1 closed that finding with `inert`; v0.10 adds explicit active-link
state. This static site adopts the active-link contract but still uses always-visible navigation
because three links fit without a menu or client runtime. Adopt the real `NavBar` if the information
architecture grows enough to require its ink-curtain overlay.

## Updating

1. Fetch tags and inspect the newest release diff, package exports, new page recipes, and audit fixes.
2. Move the submodule to an exact reviewed tag/commit.
3. Build the pinned design-system documentation workspace.
4. Run `npm run site:test`, the responsive/keyboard contract audit, and all repository lanes.
5. Update this record with the adopted version, commit, and any unresolved component findings.

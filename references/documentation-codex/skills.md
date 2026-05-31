---
source_url: https://developers.openai.com/codex/skills
canonical_url: https://developers.openai.com/codex/skills
title: Codex Skills
fetched: 2026-05-30
---

# Agent Skills — Codex

> Source: https://developers.openai.com/codex/skills

## Core purpose

> "Skills are the authoring format for reusable workflows. Plugins are the installable distribution unit for reusable skills and apps in Codex."

Skills are focused capability packages that Codex can invoke either explicitly (user references) or implicitly (Codex picks a relevant skill).

## How skills work — progressive disclosure

Codex keeps a concise index of available skills that consumes about **2% of the model's context window**. When Codex decides a skill is relevant, it loads the complete instructions from that skill's markdown file. This keeps the base context light while making domain-specific guidance available on demand.

## Activation

- **Direct invocation**: `/skills` picker, or `$skill-name` mention in the composer.
- **Implicit selection**: Codex picks a skill whose `description` matches the task.

## Minimal skill structure

A skill is a directory with a `SKILL.md` file containing front matter `name` and `description`:

```
my-skill/
└── SKILL.md
```

Optional contents:

- Executable scripts the skill can run
- Reference documentation it references
- Templates / configuration files it instructs Codex to use

## Distribution and storage

- **Single repository use**: store skills under `.agents/skills/` at the repo, user, or system level.
- **Cross-team distribution**: package skills inside a **plugin** (`skills/` directory in the plugin) and publish through a marketplace.

## Best practices (per docs)

- Keep skills focused and single-purpose.
- Write clear, imperative instructions.
- Test the skill end-to-end.

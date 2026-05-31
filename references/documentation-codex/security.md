---
source_url: https://developers.openai.com/codex/security
canonical_url: https://developers.openai.com/codex/security
title: Codex Security (Sandbox & Approvals)
fetched: 2026-05-30
note: The repo stub at `github/sandbox.md` redirects here, so this is the canonical sandboxing/approvals doc.
---

# Codex Security

> Source: https://developers.openai.com/codex/security

Codex Security helps development teams identify and fix vulnerabilities through two complementary surfaces.

## Codex Security Plugin (local)

Runs inside the Codex thread on your machine:

- Run a **deep security scan** for a higher-recall repository-wide audit.
- **Scan code changes** for security before you merge a PR or branch.
- **Remediate a backlog** with bounded fixes for approved findings.

## Codex Security Cloud (research preview)

Scans connected GitHub repositories:

- Identifies likely vulnerabilities with **repo-specific threat modeling**.
- Reduces false positives by validating findings in isolated environments.
- Returns ranked results with evidence and suggested patches.

## How it works

The cloud product reviews repositories commit-by-commit, building contextual understanding before validating findings. It prioritizes "repo-specific context instead of generic signatures."

## Access

Codex Security Cloud is available to **ChatGPT Enterprise, Edu, Business, and Pro** users on repositories connected through Codex Web.

## Related docs

- Plugin setup
- Threat-model customization
- FAQ

(See `cli-features.md > Approval Modes` for the user-facing Auto / Read-only / Full-access modes and `cli-features.md > Web Search` for prompt-injection mitigation around live web content.)

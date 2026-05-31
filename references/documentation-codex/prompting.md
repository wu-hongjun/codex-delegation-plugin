---
source_url: https://developers.openai.com/codex/prompting
canonical_url: https://developers.openai.com/codex/prompting
title: Prompting Codex
fetched: 2026-05-30
---

# Prompting Codex

> Source: https://developers.openai.com/codex/prompting

## Core principles

Codex runs an iterative loop: you submit a prompt, the agent reads files, edits, and calls tools until the task is done.

Two big recommendations:

1. **Enable verification** — Codex produces higher-quality outputs when it can verify its own work. Include reproduction steps, feature validation, and linting checks so the agent can confirm success.
2. **Break down complexity** — Codex handles complex work better when you split it into smaller, focused steps. Decomposed tasks are easier to test and review. If you're unsure about the split, ask Codex for a plan first.

## Threads

A **thread** is one session containing your prompt and all subsequent model output and tool calls. Multiple prompts inside the same thread can build progressively (e.g., implement a feature, then add tests).

Threads run either:

- **Locally** — on your machine with sandbox protection
- **In the cloud** — isolated, useful for parallel work (requires pushing code to GitHub first)

## Context, files, and images

Submit relevant file references and images with your prompt. Codex automatically gathers context from file contents and tool output and monitors remaining space in the model's context window.

## Goal mode

Goal mode keeps a persistent objective across an extended task. Define goals with **specific outcomes and measurable criteria** so Codex can decide next steps and recognize completion. Enable with `/goal`.

**Example well-defined goal:**

> Migrate this codebase from JavaScript to TypeScript. The app should compile in strict mode without explicit `any` type definitions.

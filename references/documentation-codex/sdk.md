---
source_url: https://developers.openai.com/codex/sdk
canonical_url: https://developers.openai.com/codex/sdk
title: Codex SDK (TypeScript & Python)
fetched: 2026-05-30
relevance: high
note: SDK is one way for a plugin to programmatically drive Codex - relevant to cc-plugin-codex.
---

# Codex SDK

> Source: https://developers.openai.com/codex/sdk

Programmatic control of local Codex agents via TypeScript and Python libraries.

## When to use it

- Control Codex from CI/CD pipelines.
- Build agents that engage Codex for engineering tasks.
- Integrate Codex into internal tools and custom apps.

## TypeScript

Requires **Node.js 18+**.

```bash
npm install @openai/codex-sdk
```

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();
const result = await thread.run("Your prompt here");
```

You can continue on the same thread or resume a previous thread by its id.

## Python (experimental)

Requires **Python 3.10+**. The Python SDK controls the local Codex **app-server** over JSON-RPC.

```bash
cd sdk/python
python -m pip install -e .
```

```python
from codex_app_server import Codex

with Codex() as codex:
    thread = codex.thread_start(model="gpt-5.4")
    result = thread.run("Your prompt here")
```

An async variant (`AsyncCodex`) is available.

## See also

- [`app-server.md`](./app-server.md) — the JSON-RPC protocol the SDK speaks.
- [`github/sdk-typescript-README.md`](./github/sdk-typescript-README.md) — TS SDK README from the repo.
- [`github/sdk-python-README.md`](./github/sdk-python-README.md) — Python SDK README.
- [`github/sdk-python-api-reference.md`](./github/sdk-python-api-reference.md) — Python API reference.
- [`github/sdk-python-getting-started.md`](./github/sdk-python-getting-started.md).
- [`github/sdk-python-faq.md`](./github/sdk-python-faq.md).

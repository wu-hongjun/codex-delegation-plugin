---
source_url: https://developers.openai.com/codex/auth
canonical_url: https://developers.openai.com/codex/auth
title: Authentication
fetched: 2026-05-30
---

# Authentication — Codex

> Source: https://developers.openai.com/codex/auth

## Sign-in methods

1. **ChatGPT sign-in** — subscription-based access with workspace permissions and enterprise controls.
2. **API key authentication** — usage-based billing via the OpenAI Platform.

The method you pick determines which administrative controls and data policies apply to your Codex usage.

## ChatGPT auth flow

Codex opens a browser window to complete the login flow. You can also pipe an access token to Codex via stdin if your environment already has one.

## API key auth

Use an API key from the OpenAI dashboard for standard API billing. Features that depend on ChatGPT credits (e.g., **Fast mode**) are **not available** with API key auth.

## Enterprise access tokens

ChatGPT Enterprise workspace admins can let members create **Codex access tokens** for trusted, non-interactive local workflows. These tokens give workspace access without requiring a browser sign-in.

## MFA recommendation

Multi-factor authentication is strongly recommended for Codex cloud accounts because Codex interacts with your codebase directly. Email/password users must enable MFA before they can use Codex cloud.

## Credential storage

Cached credentials are stored locally. The `cli_auth_credentials_store` config key controls where:

- `file` — plain file in `CODEX_HOME`
- `keyring` — OS-native secure storage
- `auto` — default that picks the safest option

## Headless / remote environments

Use **device code authentication** (beta) instead of a browser flow:

```json
{
  "method": "account/login/start",
  "params": { "type": "chatgptDeviceCode" }
}
```

(See `app-server.md` for the full JSON-RPC contract.)

---
name: mcp-app-security
description: "Threat-model and secure MCP Apps, MCP servers, and custom hosts. Review iframe isolation, postMessage validation, tool authorization, Streamable HTTP Origin checks, session safety, OAuth, SSRF, XSS, prompt injection, secrets, and untrusted MCP content. WHEN: 'secure my MCP App', 'MCP App threat model', 'review MCP host security', 'is this iframe sandbox safe', 'prevent SSRF', 'secure MCP OAuth', 'validate postMessage', 'security audit MCP server'."
---

# MCP App Security

Security review for the complete MCP App trust chain:

```text
model/agent -> MCP client/host -> MCP server -> UI resource -> sandboxed view
```

Compatibility is not security. An app can render correctly while still exposing
the host origin, allowing arbitrary network egress, trusting forged bridge
messages, or relaying untrusted content into the model.

## Mandatory first decision: content trust

Before selecting sandbox flags, determine which trust mode applies:

| Mode | Description | Required isolation |
|---|---|---|
| Trusted first-party | Host and every UI resource are controlled and reviewed together | Dedicated sandbox origin still recommended |
| Approved partner | Server/UI is reviewed but released independently | Different-origin sandbox, strict CSP and explicit grants |
| Untrusted/arbitrary | User can connect any MCP server | Different-origin sandbox proxy is mandatory; deny by default |

Never apply a first-party host configuration to arbitrary MCP servers.

## Review order

1. Read [threat-model.md](threat-model.md).
2. Review the host with [host-security.md](host-security.md).
3. Review the server, transport, OAuth and egress with
   [server-security.md](server-security.md).
4. Run the compatibility audit in `mcp-app-audit`.
5. Verify security behavior with negative tests, not only successful rendering.

## Security checklist

### Host and UI resource

- [ ] App content runs on a different origin from host secrets and session cookies.
- [ ] `allow-same-origin` is granted only to a different-origin sandbox document.
- [ ] Sandbox flags and permissions are granted per resource, not globally.
- [ ] `postMessage` handlers verify `event.source`, validate JSON-RPC schemas and
      reject oversized/unexpected messages.
- [ ] Link opening validates scheme and destination; no raw `javascript:`, `data:`
      or unapproved custom schemes.
- [ ] CSP starts from `default-src 'none'` and only widens declared capabilities.
- [ ] Tool input/result and model-provided text are rendered with text APIs or
      sanitization; never interpolate untrusted HTML.

### MCP server and transport

- [ ] Streamable HTTP validates `Origin` and rejects invalid origins with `403`.
- [ ] Local-only servers bind loopback, not `0.0.0.0`.
- [ ] Remote servers authenticate and authorize every tool call.
- [ ] Request body, tool input, response, media and session counts have limits.
- [ ] Stateful sessions have TTL, maximum count, cleanup and termination handling.
- [ ] User-provided URLs cannot reach loopback, link-local, metadata or private
      networks unless explicitly required and authorized.
- [ ] Outbound responses enforce timeout, redirect, content-type and size limits.

### Identity, OAuth and secrets

- [ ] Authorization Code + PKCE uses a unique verifier and `state` per flow.
- [ ] Callback state is bound to the initiating user/session and consumed once.
- [ ] Tokens remain server-side and are stored through credential references or a
      secrets service, not returned in tool/UI payloads.
- [ ] Logs redact tokens, authorization headers, cookies and sensitive tool data.

### Model and tool boundary

- [ ] UI/user/tool content passed to the model is marked as untrusted data.
- [ ] `updateModelContext` cannot silently turn webpage/tool text into privileged
      instructions.
- [ ] Destructive or sensitive tools require authorization and confirmation.
- [ ] Sampling does not auto-approve server-offered tools without policy checks.

## Output

Produce:

1. Trust mode and protected assets.
2. Entry points and trust boundaries.
3. Findings classified Critical / Important / Suggestion.
4. Required code/configuration changes.
5. Negative verification cases proving the controls work.

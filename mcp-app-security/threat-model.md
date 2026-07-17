# MCP App Threat Model

## Assets

- Host authentication cookies, tokens and local storage
- MCP server credentials and downstream API access
- User files and workspace data
- Tool authorization and destructive capabilities
- Conversation/model context
- UI integrity and user intent

## Trust boundaries

```text
untrusted model output
        |
        v
host/agent -- MCP transport -- server -- external services
    |
    +-- postMessage -- sandbox origin -- MCP App HTML/JS
```

Treat each boundary independently. Connecting to a trusted MCP server does not
automatically make every returned UI resource safe, and sandboxing a UI does not
authorize its tool calls.

## Primary threats

| Threat | Example | Control |
|---|---|---|
| Host-origin compromise | `srcdoc` app gets host origin through `allow-same-origin` | Different-origin sandbox proxy |
| Forged bridge message | Another frame sends `tools/call` | Verify `event.source`, schema and request IDs |
| XSS | Tool/model text assigned to `innerHTML` | `textContent`, DOM APIs, reviewed sanitizer |
| SSRF | App asks server to fetch a user URL | Destination policy, DNS/IP checks, time/size limits |
| Session hijack | Predictable/reused MCP session ID | Secure random ID, authorization binding, expiry |
| Prompt injection | Tool/UI text enters model context as instructions | Mark as untrusted data, constrain purpose |
| Confused deputy | UI calls a privileged hidden tool | Per-tool authorization independent of visibility |
| OAuth CSRF | Callback accepted without matching state | Single-use state + PKCE + session binding |
| Data exfiltration | Arbitrary `connect-src`, open link or logging | Deny-by-default egress and redaction |
| Resource exhaustion | Unlimited sessions/media/tool output | Quotas, cancellation, TTL and payload limits |

## Trust-mode decision

Document one of these in every host:

1. **First-party-only**: all servers and UI resources are controlled together.
2. **Approved catalog**: only reviewed/pinned servers are accepted.
3. **Open ecosystem**: arbitrary servers can connect.

Open-ecosystem hosts must assume hostile HTML, JavaScript, tool metadata and tool
results. They require a separate sandbox origin and policy enforcement outside
the framed app.

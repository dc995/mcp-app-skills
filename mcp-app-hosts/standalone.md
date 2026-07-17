# Standalone Host — basic-host Reference Implementation

The `basic-host` example from the ext-apps repo is a minimal MCP Apps host for local testing.

## Setup

```bash
git clone https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps
cd /tmp/mcp-ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm start
# Open http://localhost:8080 — list multiple server URLs in the array to connect several at once
```

> basic-host ships collapsible **Tool Input / Tool Result / Messages / Model Context** debug
> panels and `[HOST]`-prefixed console logs. Use it as the first-pass protocol debugger before
> VS Code. See [`../mcp-app-test/debugging.md`](../mcp-app-test/debugging.md) and the
> [ext-apps testing guide](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/testing-mcp-apps.md).

## Capabilities

Reference browser host intended for protocol testing. Treat its exact CSP,
sandbox and capability behavior as versioned upstream behavior rather than a
universal browser baseline.

- `eval()` / `new Function()`: Yes
- External CDN scripts: Yes
- External fetch: Yes
- All permission APIs: Yes (browser-level consent)
- No TLS (HTTP only, localhost:8080)
- `connect-src`: unrestricted

## Uses

- **First-pass validation**: confirm your app works at all before testing in restrictive hosts
- **Protocol debugging**: simpler environment, easier to trace postMessage flow
- **Permissive host baseline**: if it doesn't work here, it's a code bug, not a host constraint

## Implementation Notes

basic-host uses `AppBridge` from `@modelcontextprotocol/ext-apps/app-bridge` and `PostMessageTransport` — which handles the JSON-RPC protocol automatically. This is the easier path vs manual postMessage implementation.

## When to Use

1. Building a new app → test in basic-host first
2. Debugging a protocol issue → simpler than VS Code DevTools
3. Comparing behavior → same app in basic-host vs VS Code reveals host-specific failures

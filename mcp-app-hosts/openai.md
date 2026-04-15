# ChatGPT Host — Stub

**Status**: Unvalidated. Populate as you test apps against ChatGPT.

## Known from Blog/Docs

- ChatGPT supports MCP Apps via OpenAI Apps SDK (announced Jan 2026)
- Transport: streamable-http
- TLS: required (cloud-hosted)

## To Validate

- [ ] CSP policy string
- [ ] `eval()` / `new Function()` allowed?
- [ ] External CDN script tags allowed?
- [ ] External fetch scope
- [ ] Sandbox permissions (microphone, camera, geo, clipboard)
- [ ] `HostCapabilities.sandbox` contents
- [ ] iframe origin
- [ ] localStorage persistence

## How to Validate

1. Deploy an MCP server with a diagnostic tool
2. Connect via ChatGPT Apps SDK
3. Run diagnostics, record in `host-matrix.json` via HIT process

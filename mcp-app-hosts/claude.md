# Claude.ai Host — Stub

**Status**: Unvalidated. Populate as you test apps against Claude.ai.

## Known from Blog/Docs

- Supports MCP Apps (announced Jan 2026)
- `eval()` / `new Function()`: reportedly allowed (ext-apps threejs-server works)
- Microphone/camera: reportedly permitted
- Transport: streamable-http
- TLS: required (cloud-hosted)

## To Validate

- [ ] CSP policy string (check DevTools)
- [ ] `connect-src` scope — can UI fetch external domains?
- [ ] External `<script src>` CDN tags — allowed?
- [ ] Sandbox permissions actually granted (microphone, camera, geo, clipboard)
- [ ] `HostCapabilities.sandbox` contents returned during `ui/initialize`
- [ ] iframe origin / same-origin policy
- [ ] localStorage persistence across sessions

## How to Validate

1. Deploy an MCP server with a diagnostic tool that reports environment
2. Connect to Claude.ai as MCP server
3. Run the diagnostic tool
4. Record results in `host-matrix.json` via HIT process

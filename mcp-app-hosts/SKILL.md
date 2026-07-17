---
name: mcp-app-hosts
description: "MCP App host reference AND host-authoring guide. Query host capabilities, check what works where, record discoveries, and build your own host. Use when asking 'does X work in VS Code?', 'which hosts support microphone?', 'why does my app break in VS Code?', 'host compatibility matrix', 'what CSP does VS Code use?', 'record a new host discovery', 'how do I build an MCP App host?', 'author a host on the GitHub Copilot SDK', 'wire MCP servers into createSession', 'implement a sampling bridge in my host'."
---

# MCP App Hosts

Reference skill for MCP App host environments **and authoring your own host**. Each host
(VS Code, AppHub, standalone) has different CSP, sandbox, and capability constraints — this
skill is the source of truth for what works where. It also documents how to **build** a custom
host (AppHub-style LLM orchestration, or on the GitHub Copilot SDK).

This matrix lists only hosts that have been directly validated firsthand. Treat
every unlisted host as unknown until its lifecycle, CSP, permissions, transport,
accessibility and security behavior are recorded through
[hit-process.md](hit-process.md).

## Quick Capability Matrix

<!-- BEGIN GENERATED HOST SUMMARY -->
| Capability | VS Code | AppHub | Standalone | CopilotHub |
|---|---|---|---|---|
| `eval()` / `new Function()` | **NO** | Yes | Yes | Yes |
| External `<script src>` CDN | **NO** | Yes | Yes | Yes |
| External UI `fetch()` | **NO** | Yes | Yes | Yes |
| External media source | **NO** | Yes | Yes | Yes |
| Media autoplay | **NO** | Unvalidated | Unvalidated | Unvalidated |
| `window.open()` | **NO** | Yes | Yes | Yes |
| Microphone | **NO** | Yes | Yes | Yes |
| Camera | **NO** | Yes | Yes | Yes |
| Geolocation | **NO** | Yes | Yes | Yes |
| Canvas 2D | Yes | Yes | Yes | Yes |
| WebGL | Yes | Yes | Yes | Yes |
| Web Workers | Yes | Yes | Yes | Yes |
| WebSockets | Yes | Yes | Yes | Yes |
| Nested iframes | **NO** | Yes | Yes | Yes |
| Sampling (`createMessage`) | Yes | Yes | Unvalidated | Yes |
| Elicitation (`elicitInput`) | Unvalidated | **NO** | Unvalidated | **NO** |
<!-- END GENERATED HOST SUMMARY -->

**Server-initiated requests** (sampling, elicitation, resource subscriptions)
require a **stateful** server transport (`sessionIdGenerator: randomUUID`) — the
default stateless transport silently times them out. They also require the host's
MCP *client* to advertise the capability. See `host-matrix.json`
(`server-initiated` block) and `mcp-app-build/sampling.md`. Always ship a Display‑Frame
fallback so the app degrades where the host can't sample/elicit.

**Media in VS Code**: `media-src 'self'` blocks external audio/video URLs and the
sandboxed iframe gets no `autoplay` / Web Speech grant. The `_meta.ui.csp` /
`sandbox.permissions` opt-ins are spec'd but **not honored** by VS Code today. Proxy media
through the server and return same-origin bytes (`data:` URL / embedded resource), played on a
user gesture. See [vscode.md](vscode.md) §7.

VS Code is the most restrictive host in the **currently validated set**, but a
pass there is not a guarantee for an unknown host. Validate lifecycle,
permissions, accessibility and transport behavior on every declared target.
See [hit-process.md](hit-process.md) for recording evidence.

> **CopilotHub** (GitHub Copilot SDK host) is a permissive custom host — its capability
> profile matches **AppHub** for every row above (full browser, `about:srcdoc`, popups
> allowed), **plus** a verified server→host **sampling** bridge (elicitation not implemented).
> See [`host-matrix.json`](host-matrix.json) (`copilothub`) and [copilot-sdk-host.md](copilot-sdk-host.md).

## Sub-Files

| File | Purpose |
|---|---|
| [host-matrix.json](host-matrix.json) | Machine-readable capability registry (source of truth) |
| [vscode.md](vscode.md) | VS Code Insiders: CSP, sandbox, TLS, OAuth workaround, broken/working patterns |
| [apphub.md](apphub.md) | AppHub custom host: architecture, proxy, postMessage protocol |
| [standalone.md](standalone.md) | basic-host / standalone browser reference environment |
| [copilot-sdk-host.md](copilot-sdk-host.md) | Authoring a host on the GitHub Copilot SDK (`createSession`): `tools: ["*"]` requirement, hooks-based tool-call capture |
| [host-rendering.md](host-rendering.md) | Rendering MCP App tiles in a web/React host: iframe sandbox flags, CSP, dual `_meta` resource-URI shapes, host theming (dark/light), PDF/plugin escapes, the opaque-handle relay fix, and the sampling reverse-channel for interactive tiles |
| [hit-process.md](hit-process.md) | HIT feedback loop: how to discover, classify, record, propagate |

## Usage

When building or auditing an MCP App, check the target host's capabilities:

1. Read `host-matrix.json` for programmatic checks
2. Read the host-specific file for detailed constraints and workarounds
3. If you discover something new, follow the HIT process to record it

## Authoring a Host

Building your own MCP App host (not just targeting one)? Two reference implementations live here:

- [apphub.md](apphub.md) — **LLM-orchestrated host**: your own agent loop, an MCP `Client`
  proxy to downstream servers, manual postMessage bridge, splash + shared state.
- [copilot-sdk-host.md](copilot-sdk-host.md) — **GitHub Copilot SDK host**:
  feed servers into `createSession({ mcpServers })`, dual-channel architecture, hub-injected
  tools, hooks-based tool-call capture, result normalization, and a **server→host sampling
  bridge**. Start here for the `tools: ["*"]` and tool-capture gotchas.
- [host-rendering.md](host-rendering.md) — **the web/React rendering side** of any host:
  turning a tool result into an interactive iframe tile. iframe sandbox flags (interactivity
  vs display), per-tile CSP, reading the UI resource URI from both `_meta` shapes, theming
  tiles + host chrome for dark/light, the always-blocked PDF/plugin case and its escapes, and
  the host-side repair for the fragile "relay an opaque handle between two tools" pattern, and
  the sampling reverse-channel for tiles that borrow the host model (hint/AI buttons).

A host you author is also a *target* — once validated, add it to `host-matrix.json` via the
[HIT process](hit-process.md) so the build/test/audit skills account for it.

## The Validated Portable Set

These features work reliably across **all** validated hosts:

- Canvas 2D / WebGL rendering
- Safe DOM manipulation (`createElement`, `textContent`, `classList`); sanitize
  any intentionally supported HTML
- CSS animations, transitions, custom properties, `var(--host-variables)`
- `postMessage` communication (MCP App bridge protocol)
- npm-bundled + vite-plugin-singlefile HTML output
- Server-proxied external data (server.ts fetches, returns via tool result)
- `app.callServerTool()` for UI→server communication
- `app.updateModelContext()` for UI→model communication

If your app stays within this set, it is compatible with the currently validated
hosts under the recorded versions. Unknown hosts still require validation.

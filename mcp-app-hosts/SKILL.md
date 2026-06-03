---
name: mcp-app-hosts
description: "MCP App host environment reference. Query host capabilities, check what works where, and record new discoveries. Use when asking 'does X work in VS Code?', 'which hosts support microphone?', 'why does my app break in VS Code?', 'host compatibility matrix', 'what CSP does VS Code use?', 'record a new host discovery'."
---

# MCP App Hosts

Reference skill for MCP App host environments. Each host (VS Code, AppHub, standalone) has different CSP, sandbox, and capability constraints. This skill is the source of truth.

This matrix lists only hosts that have been **directly validated** firsthand. Other hosts that render MCP App UIs (for example, cloud chat assistants) are generally *more* permissive than VS Code — but only add a host here after validating its capabilities yourself via [hit-process.md](hit-process.md). Until then, treat any unlisted host as "unknown" and ship against the [Universal Safe Set](#the-universal-safe-set).

## Quick Capability Matrix

| Capability | VS Code | AppHub | Standalone |
|---|---|---|---|
| `eval()` / `new Function()` | **NO** | Yes | Yes |
| External `<script src>` CDN | **NO** | Yes | Yes |
| External `fetch()` | **NO** | Yes | Yes |
| `window.open()` (popups) | **NO** | Yes | Yes |
| Microphone | **NO** | Yes | Yes |
| Camera | **NO** | Yes | Yes |
| Geolocation | **NO** | Yes | Yes |
| Canvas / WebGL | Yes | Yes | Yes |
| npm-bundled + singlefile | Yes | Yes | Yes |
| Server-proxied data | Yes | Yes | Yes |
| Web Workers | Yes | Yes | Yes |
| WebSockets | Yes | Yes | Yes |
| Nested iframes | **NO** | Yes | Yes |

VS Code is the strictest validated host, so **an app built for VS Code runs everywhere**. See [hit-process.md](hit-process.md) for how to record discoveries about a new host.

## Sub-Files

| File | Purpose |
|---|---|
| [host-matrix.json](host-matrix.json) | Machine-readable capability registry (source of truth) |
| [vscode.md](vscode.md) | VS Code Insiders: CSP, sandbox, TLS, OAuth workaround, broken/working patterns |
| [apphub.md](apphub.md) | AppHub custom host: architecture, proxy, postMessage protocol |
| [standalone.md](standalone.md) | basic-host / standalone browser (most permissive) |
| [hit-process.md](hit-process.md) | HIT feedback loop: how to discover, classify, record, propagate |

## Usage

When building or auditing an MCP App, check the target host's capabilities:

1. Read `host-matrix.json` for programmatic checks
2. Read the host-specific file for detailed constraints and workarounds
3. If you discover something new, follow the HIT process to record it

## The Universal Safe Set

These features work reliably across **all** validated hosts:

- Canvas 2D / WebGL rendering
- DOM manipulation (createElement, innerHTML, classList)
- CSS animations, transitions, custom properties, `var(--host-variables)`
- `postMessage` communication (MCP App bridge protocol)
- npm-bundled + vite-plugin-singlefile HTML output
- Server-proxied external data (server.ts fetches, returns via tool result)
- `app.callServerTool()` for UI→server communication
- `app.updateModelContext()` for UI→model communication

**If your app stays within this set, it works everywhere.**

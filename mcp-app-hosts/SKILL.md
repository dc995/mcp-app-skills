---
name: mcp-app-hosts
description: "MCP App host environment reference. Query host capabilities, check what works where, and record new discoveries. Use when asking 'does X work in VS Code?', 'which hosts support microphone?', 'why does my app break in VS Code?', 'host compatibility matrix', 'what CSP does VS Code use?', 'record a new host discovery'."
---

# MCP App Hosts

Reference skill for MCP App host environments. Each host (VS Code, AppHub, Claude, ChatGPT, standalone) has different CSP, sandbox, and capability constraints. This skill is the source of truth.

## Quick Capability Matrix

| Capability | VS Code | AppHub | Standalone | Claude | ChatGPT |
|---|---|---|---|---|---|
| `eval()` / `new Function()` | **NO** | Yes | Yes | Yes | ? |
| External `<script src>` CDN | **NO** | Yes | Yes | ? | ? |
| External `fetch()` | **NO** | Yes | Yes | ? | ? |
| Microphone | **NO** | Yes | Yes | Yes | ? |
| Camera | **NO** | Yes | Yes | Yes | ? |
| Geolocation | **NO** | Yes | Yes | ? | ? |
| Canvas / WebGL | Yes | Yes | Yes | Yes | ? |
| npm-bundled + singlefile | Yes | Yes | Yes | Yes | ? |
| Server-proxied data | Yes | Yes | Yes | Yes | ? |
| Web Workers | Yes | Yes | Yes | ? | ? |
| WebSockets | Yes | Yes | Yes | ? | ? |
| Nested iframes | **NO** | Yes | Yes | ? | ? |

**? = unvalidated** — see [hit-process.md](hit-process.md) for how to record discoveries.

## Sub-Files

| File | Purpose |
|---|---|
| [host-matrix.json](host-matrix.json) | Machine-readable capability registry (source of truth) |
| [vscode.md](vscode.md) | VS Code Insiders: CSP, sandbox, TLS, known broken/working SDKs |
| [apphub.md](apphub.md) | AppHub custom host: architecture, proxy, postMessage protocol |
| [standalone.md](standalone.md) | basic-host / standalone browser (most permissive) |
| [claude.md](claude.md) | Claude.ai specifics (stub) |
| [openai.md](openai.md) | ChatGPT Apps SDK specifics (stub) |
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

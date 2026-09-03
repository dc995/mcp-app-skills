---
name: mcp-app-build
description: "Build MCP Apps with interactive UIs. Scaffold new apps, register tools and resources, configure vite-plugin-singlefile, and target multiple hosts safely. Replaces create-mcp-app with host-aware pre-build safety checks. WHEN: 'create an MCP App', 'add a UI to an MCP tool', 'scaffold an MCP App', 'build an interactive MCP View', 'MCP Apps SDK patterns', 'UI-resource registration', 'MCP App lifecycle', 'host integration'."
---

# MCP App Build

Build interactive UIs that run inside MCP-enabled hosts. An MCP App combines an MCP tool with an HTML resource to display rich, interactive content inside the conversation.

## ⚠️ MANDATORY: Pre-Build Safety Check

**Before writing any code**, run the pre-build check in [pre-build-check.md](pre-build-check.md).

This checks your planned features against the target host's capabilities (from the `mcp-app-hosts` skill). If your app uses external CDN scripts, eval, browser permissions, or external fetch — you'll learn about it BEFORE building, not after.

## Core Concept: Tool + Resource

Every MCP App has two halves:

1. **Tool** — called by the LLM/host, returns data + declares `_meta.ui.resourceUri`
2. **Resource** — serves bundled HTML/JS/CSS that the host renders in a sandboxed iframe

```
Host calls tool → Server returns result → Host renders resource UI → UI receives result
```

## Pick a protocol profile first

For new work, use MCP `2026-07-28` and the SDK v2 package split. Modern requests
are self-contained: no core `initialize` handshake and no `Mcp-Session-Id`.
Read [mcp-v2.md](mcp-v2.md) before selecting a transport or application-state
strategy.

Keep the MCP Apps iframe `ui/initialize` lifecycle separate from the MCP core
profile. If a current extension dependency still requires SDK v1, isolate it in
a bounded compatibility adapter rather than making sessionful v1 behavior the
app architecture.

## Pick an interaction shape

Before scaffolding, decide which of two shapes your app is — it determines the
transport and whether you depend on host capabilities.

| | **Type A — Display Frame** (default, ~90%) | **Type B — Interactive / Agentic Frame** |
|---|---|---|
| Behavior | Tool in → content + UI out. | A call needs user/model input, subscriptions, or explicit cross-call state. |
| Modern `2026-07-28` | Stateless request/response. | MRTR (`input_required` + retry), `subscriptions/listen`, or explicit application handles. |
| Legacy compatibility | Stateless v1 can serve display-only tools. | Sessionful v1 may be required for `sampling/createMessage`, `elicitation/create`, or old subscriptions. |
| Host dependency | None beyond tools/resources. | Detect negotiated extension/capability support and always ship a Type A fallback. |
| Guide | this skill + [scaffold.md](scaffold.md) | [mcp-v2.md](mcp-v2.md) and [sampling.md](sampling.md) |

**Rule of thumb:** modern interaction does not imply a hidden transport session.
Use MRTR for input needed during one call and an explicit handle for state across
calls. Use a session map only inside a declared legacy compatibility profile.

For VS Code sampling, capability negotiation is necessary but not sufficient:
authorize the exact server under `chat.mcp.serverSampling`. App-button requests
need `allowedOutsideChat`; validate other invocation contexts separately.

## Sub-Files

| File | Purpose |
|---|---|
| [pre-build-check.md](pre-build-check.md) | **Run first** — safety gate vs host capabilities |
| [mcp-v2.md](mcp-v2.md) | MCP `2026-07-28`, SDK v2, stateless requests, MRTR, handles, caching, auth and migration |
| [scaffold.md](scaffold.md) | Project structure, deps, vite config, main.ts/server.ts templates (stateless + stateful) |
| [sampling.md](sampling.md) | Modern alternatives plus bounded legacy sampling/elicitation behavior |
| [patterns.md](patterns.md) | SDK lifecycle, handlers, data-driven rendering, host styling |
| [references/sdk-api.md](references/sdk-api.md) | App class, registerAppTool, registerAppResource quick-ref |

## Quick Start Decision Tree

### Target Host Selection

| Host | Key Constraint | Link |
|---|---|---|
| VS Code | No eval, no CDN, no external fetch, no mic/camera | Read `mcp-app-hosts/vscode.md` |
| AppHub | First-party permissive host; security depends on its trust mode | Read `mcp-app-hosts/apphub.md` |
| Standalone | Reference test host; inspect the current implementation | Read `mcp-app-hosts/standalone.md` |
| Multi-host | Start with the Validated Portable Set (canvas, safe DOM, bundled JS, server proxy) | Read `mcp-app-hosts/SKILL.md` |

**If targeting VS Code (or multi-host), use the data-driven pattern exclusively.**

If the design includes a custom host, OAuth, arbitrary external URLs, sensitive
tools, model-context updates or third-party UI resources, run
`mcp-app-security` before scaffolding.

### Framework Selection

| Framework | SDK Support | Best For |
|---|---|---|
| Vanilla JS | Manual lifecycle | Simple apps, no build complexity |
| React | `useApp` + `useHostStyles` hooks | Teams familiar with React |
| Vue/Svelte/Preact/Solid | Manual lifecycle | Framework preference |

## Standard File Structure

```
<AppName>MCPapp/
├── package.json
├── tsconfig.json              # Type-checking (noEmit, bundler resolution)
├── tsconfig.server.json       # Server compilation (NodeNext)
├── vite.config.ts             # Bundles UI into single HTML via vite-plugin-singlefile
├── server.ts                  # Registers tools + UI resources
├── main.ts                    # Entry point: HTTP + stdio transports
├── mcp-app.html               # UI HTML shell
└── src/
    └── mcp-app.ts             # UI logic (vanilla JS or framework)
```

## Endpoint assignment

Use configuration rather than a fixed repository-wide port table. For local
HTTP development, bind loopback and select an unused port. If the target host
requires HTTPS, configure a trusted local development certificate or reverse
proxy. Do not assume a universal `HTTP + 1000` TLS convention.

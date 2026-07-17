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

## Pick a Frame Type first

Before scaffolding, decide which of two shapes your app is — it determines the
transport and whether you depend on host capabilities.

| | **Type A — Display Frame** (default, ~90%) | **Type B — Interactive / Agentic Frame** |
|---|---|---|
| Behavior | Tool in → content + UI out. No server-initiated traffic. | Server calls **back** into the client mid-tool. |
| Triggers | — | `sampling/createMessage`, `elicitation/create`, resource subscriptions, cross-call progress |
| Transport | **Stateless** (`sessionIdGenerator: undefined`) | **Stateful** (`sessionIdGenerator: () => randomUUID()` + session map) |
| Host dependency | None beyond tools/resources | Host must advertise `sampling` / `elicitation`; **always ship a Type A fallback** |
| Guide | this skill + [scaffold.md](scaffold.md) | [sampling.md](sampling.md) |

**Rule of thumb:** any server→client *request* (not just a notification) ⇒ Type B
/ stateful. If your tools only return content, you are Type A — stay there.

## Sub-Files

| File | Purpose |
|---|---|
| [pre-build-check.md](pre-build-check.md) | **Run first** — safety gate vs host capabilities |
| [scaffold.md](scaffold.md) | Project structure, deps, vite config, main.ts/server.ts templates (stateless + stateful) |
| [sampling.md](sampling.md) | **Frame Type B** — sampling/elicitation/subscriptions, stateful transport, graceful degradation |
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

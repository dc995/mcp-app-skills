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

## Sub-Files

| File | Purpose |
|---|---|
| [pre-build-check.md](pre-build-check.md) | **Run first** — safety gate vs host capabilities |
| [scaffold.md](scaffold.md) | Project structure, deps, vite config, main.ts/server.ts templates |
| [patterns.md](patterns.md) | SDK lifecycle, handlers, data-driven rendering, host styling |
| [references/sdk-api.md](references/sdk-api.md) | App class, registerAppTool, registerAppResource quick-ref |

## Quick Start Decision Tree

### Target Host Selection

| Host | Key Constraint | Link |
|---|---|---|
| VS Code | No eval, no CDN, no external fetch, no mic/camera | Read `mcp-app-hosts/vscode.md` |
| AppHub | Full browser — everything works | Read `mcp-app-hosts/apphub.md` |
| Standalone | Most permissive, HTTP only | Read `mcp-app-hosts/standalone.md` |
| Multi-host | Must use Universal Safe Set (canvas, DOM, bundled JS, server proxy) | Read `mcp-app-hosts/SKILL.md` |

**If targeting VS Code (or multi-host), use the data-driven pattern exclusively.**

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

## Port Assignment

Check `.vscode/mcp.json` and `start-all.ps1` for used ports. Next available = max + 1.

| App | HTTP Port | TLS Port |
|---|---|---|
| ThreeJS | 3002 | 4002 |
| Map | 3003 | 4003 |
| Budget | 3004 | 4004 |
| SystemMonitor | 3005 | 4005 |
| GetTime | 3006 | 4006 |
| InView | 3007 | 4007 |
| Transcript | 3008 | 4008 |
| AppHub | 3009 | 4009 |
| AzureMaps | 3010 | 4010 |
| **Next app** | **3011** | **4011** |

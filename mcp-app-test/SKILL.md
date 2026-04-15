---
name: mcp-app-test
description: "Test MCP Apps across hosts. Server API tests, Playwright E2E, cross-host validation, and debugging with ui-inspector. WHEN: 'test my MCP App', 'write tests for MCP server', 'cross-host testing', 'debug MCP App iframe', 'Playwright MCP tests', 'why is my MCP App broken', 'validate across hosts'."
---

# MCP App Test

Multi-layer test strategy for MCP Apps: protocol-level server tests, browser E2E, and cross-host validation.

## Test Layers

| Layer | What | Browser? | Speed | Catches |
|---|---|---|---|---|
| **Server API** | MCP protocol, tool schemas, resource serving | No | Fast | Regressions in tool logic, broken resources, schema changes |
| **E2E** | Full rendering, iframe bridge, UI interactions | Yes | Medium | CSS/layout, postMessage, iframe initialization failures |
| **Cross-Host** | Same app in multiple hosts, compare results | Yes | Slow | Host-specific CSP, permission, rendering differences |

## Sub-Files

| File | Purpose |
|---|---|
| [server-api.md](server-api.md) | Layer 1: MCP protocol tests (no browser) |
| [e2e.md](e2e.md) | Layer 2: Playwright E2E patterns (page objects, fixtures) |
| [cross-host.md](cross-host.md) | Layer 3: Multi-host validation matrix |
| [debugging.md](debugging.md) | ui-inspector, DevTools, postMessage tracing |
| [references/playwright-patterns.md](references/playwright-patterns.md) | Extracted fixtures + helpers from mcpapps1 test suite |

## Quick Start

### Run existing tests (mcpapps1 workspace)
```bash
cd tests
npm test                    # all projects
npm run test:server         # server API only (no browser)
npm run test:smoke          # smoke E2E subset
npm run test:e2e            # full E2E (headed)
npm run test:ui             # interactive Playwright UI mode
```

### Prerequisites
All servers must be running: `.\start-all.ps1` from repo root.

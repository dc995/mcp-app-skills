# MCP App Skills

Agent skills for building, auditing, testing, securing, and hosting
[MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps) — interactive HTML
UIs that render inline in AI conversation hosts (VS Code Copilot Chat, Claude,
ChatGPT, and others).

> **Status**: Early-stage. These skills reflect real-world patterns discovered through
> building 19+ MCP Apps across multiple hosts. Some host-specific findings are still
> being validated, and the MCP Apps specification itself continues to evolve. Expect
> updates as new hosts and SDK versions ship.

## Author

**David Crawford** — [@dc995](https://github.com/dc995)

## Background

### Protocol

MCP Apps are an extension to the [Model Context Protocol](https://modelcontextprotocol.io/)
(MCP) that let tools return interactive HTML interfaces — dashboards, 3D
visualizations, maps, media players — rendered inline in conversations. The
specification is maintained at
[modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps)
(stable spec: 2026-01-26).

The core pattern combines two MCP primitives:

1. **Tool** — declares `_meta.ui.resourceUri` pointing to a UI resource
2. **Resource** — serves bundled HTML/JS/CSS that the host renders in a sandboxed iframe

### How these skills originated

The [ext-apps repository](https://github.com/modelcontextprotocol/ext-apps) ships
~20 example MCP App servers (Three.js, maps, PDF, QR, audio, video, etc.). The
approach taken here was straightforward: start building from those examples, run
each one in VS Code Copilot Chat, and see what works.

Several apps failed immediately. VS Code renders MCP App UIs in an iframe with a
restrictive Content Security Policy (`script-src 'self' 'unsafe-inline'` — no
`unsafe-eval`). This blocks `eval()`, `new Function()`, external CDN `<script>`
tags, and `fetch()` to external domains. Apps that work in Claude or ChatGPT —
where CSP is more permissive — break silently in VS Code. Third-party libraries
like CesiumJS (which uses Knockout.js internally) also trigger CSP violations
through their own use of `new Function()`.

Beyond CSP, browser permission APIs (microphone, camera, geolocation) are denied
in VS Code's iframe sandbox, external network requests from the UI are blocked,
and `window.open()` popups are unavailable — breaking OAuth flows that rely on
opening a new tab.

These discoveries led to two things:

1. **A custom MCP host (AppHub)** — a standalone web application that implements
   the MCP Apps postMessage protocol with full browser capabilities, tile-based
   rendering, an AI agent for tool chaining, and shared state across apps. Building
   this host surfaced the protocol details (handshake field names, timing
   requirements, JSON-RPC message formats) that are not obvious from the spec alone.

2. **Composition patterns** — as the app count grew to 19, patterns emerged for
   multi-app orchestration: port management, TLS architecture, splash screen
   systems, server proxying for external data, data-driven rendering as a universal
   alternative to dynamic code execution, and a dual-path fallback strategy for
   hosts with different CSP policies.

These skills encode those patterns so that agents building new MCP Apps avoid
the same pitfalls.

### Comparison with the ext-apps public skill

The ext-apps repository includes a
[`create-mcp-app`](https://github.com/modelcontextprotocol/ext-apps/tree/main/plugins/mcp-apps/skills/create-mcp-app)
skill — a single `SKILL.md` file that covers the SDK API, framework selection,
project scaffolding, handler registration, and testing with `basic-host`. It is a
solid general-purpose reference for getting started.

These skills were developed independently through the process described above, and
compared afterward. The differences are structural rather than qualitative:

| Aspect | ext-apps `create-mcp-app` | These skills |
|--------|---------------------------|--------------|
| **Scope** | Single file covering build patterns | Specialized build, audit, security, host, and test skills with sub-files |
| **Host awareness** | Host-agnostic — assumes a permissive environment | Pre-build safety check against a per-host capability matrix |
| **CSP coverage** | Mentions CSP configuration for network requests | Catalogs specific CSP blockers per host (eval, CDN, fetch, permissions) with rewrite patterns |
| **Testing** | `basic-host` smoke test | Three-layer strategy: server API tests, Playwright E2E, cross-host validation |
| **Host matrix** | Not included | Machine-readable `host-matrix.json` with validated capabilities per host |
| **Audit workflow** | Not included | Scan → classify → rewrite workflow for existing apps |
| **Third-party libraries** | Not covered | Documents which libraries use `eval`/`new Function()` internally (Knockout, CesiumJS widgets) |
| **Data-driven pattern** | Not prescribed | Prescriptive: structured data input instead of code strings for VS Code compatibility |

The ext-apps skill is the right starting point for building your first MCP App.
These skills add depth for teams targeting multiple hosts, auditing existing apps
for compatibility, or operating at scale with many apps and automated testing.

## Skills

### mcp-app-build

Build new MCP Apps from scratch. Includes a mandatory pre-build safety check
against the target host's capabilities, project scaffolding templates, SDK
patterns (handlers, data-driven rendering, host styling), and framework guidance.

**Files:**

| File | Purpose |
|------|---------|
| `SKILL.md` | Entry point — decision tree, file structure, port assignment |
| `pre-build-check.md` | Safety gate: scan planned features against host capability matrix |
| `scaffold.md` | Templates: `server.ts`, `main.ts` (stateless + stateful), `vite.config.ts`, `package.json` |
| `sampling.md` | Frame Type B: sampling/elicitation/subscriptions, stateful transport, graceful degradation |
| `patterns.md` | SDK lifecycle, data-driven rendering, tool visibility, host styling, server proxying |
| `references/sdk-api.md` | Quick reference: `App` class, `registerAppTool`, `registerAppResource` |

### mcp-app-audit

Audit existing MCP Apps for host compatibility. Provides a scan checklist for
CSP violations, external CDN dependencies, `eval` usage, blocked permission APIs,
and external fetch calls. Classifies findings by severity and provides specific
rewrite patterns.

**Files:**

| File | Purpose |
|------|---------|
| `SKILL.md` | Scan checklist, classification matrix, rewrite patterns |

### mcp-app-hosts

Host environment reference. Per-host capability documentation covering CSP
policies, sandbox restrictions, and validated/unvalidated features. Includes a
machine-readable capability matrix and a process for recording new discoveries.

**Files:**

| File | Purpose |
|------|---------|
| `SKILL.md` | Quick capability matrix, usage guide |
| `host-matrix.json` | Machine-readable capability registry (source of truth) |
| `vscode.md` | VS Code Insiders: CSP, sandbox, TLS, OAuth workaround, broken/working patterns |
| `apphub.md` | AppHub custom host: architecture, postMessage protocol details |
| `copilot-sdk-host.md` | Authoring a host on the GitHub Copilot SDK: dual-channel, `tools:["*"]`, hooks-based tool capture, sampling bridge |
| `host-rendering.md` | Rendering MCP App tiles in a web/React host: iframe sandbox flags, per-tile CSP, dual `_meta` resource-URI shapes, dark/light theming, PDF/plugin escapes, the opaque-handle relay fix, and the sampling reverse-channel for interactive tiles |
| `standalone.md` | Standalone browser / basic-host reference environment |
| `hit-process.md` | HIT feedback loop: discover, classify, record, propagate findings |

### mcp-app-test

Multi-layer test strategy for MCP Apps: protocol-level server tests (no browser),
Playwright E2E tests, cross-host validation, and debugging guidance.

**Files:**

| File | Purpose |
|------|---------|
| `SKILL.md` | Test layers overview, quick start, philosophy |
| `server-api.md` | Layer 1: MCP protocol tests — tool schemas, resource serving |
| `e2e.md` | Layer 2: Playwright E2E — page objects, fixtures, iframe bridge |
| `cross-host.md` | Layer 3: Multi-host validation matrix |
| `debugging.md` | ui-inspector, DevTools, postMessage tracing |
| `references/playwright-patterns.md` | Extracted fixtures and helpers |

### mcp-app-security

Threat-model MCP Apps, servers and custom hosts. Covers different-origin iframe
isolation, bridge validation, Streamable HTTP security, OAuth, SSRF, XSS,
prompt/tool injection, secrets and session limits.

**Files:**

| File | Purpose |
|------|---------|
| `SKILL.md` | Security review entry point and checklist |
| `threat-model.md` | Assets, trust modes, boundaries and primary threats |
| `host-security.md` | Sandbox origin, CSP, postMessage and host-mediated actions |
| `server-security.md` | HTTP/session, OAuth, egress and model-context controls |

### mcp-app-ext (agent + MCP server)

**Conductor** — a full-stack agent for the MCP Apps *Extension* (not a single app).
Where the specialized skills above are passive references, `mcp-app-ext` is the **active**
layer: an agent persona that composes the whole stack (MCP server → UI resource →
host → stateful session) plus a companion MCP server that turns the skills'
matrix, validation, scanning and guidance into callable tools.

**Files:**

| File | Purpose |
|------|---------|
| `SKILL.md` | Conductor meta-skill: routes build/host/security/test/audit and composes the full stack |
| `.github/agents/mcp-app-ext.agent.md` | Repository and installable Copilot custom-agent definition |
| `mcp-server/` | Runnable stdio MCP server exposing host/multi-host checks, matrix validation, bounded app scanning, guidance and scaffold guidance |
| `README.md` | Why it exists, the stack it composes, how to run the server |

## Installation

### VS Code / GitHub Copilot

Copy the skill folders to your global Copilot skills directory:

```powershell
# Windows
New-Item -ItemType Directory -Force "$env:USERPROFILE\.copilot\skills" | Out-Null
New-Item -ItemType Directory -Force "$env:USERPROFILE\.copilot\agents" | Out-Null
Copy-Item -Recurse mcp-app-build  "$env:USERPROFILE\.copilot\skills\mcp-app-build"
Copy-Item -Recurse mcp-app-audit  "$env:USERPROFILE\.copilot\skills\mcp-app-audit"
Copy-Item -Recurse mcp-app-hosts  "$env:USERPROFILE\.copilot\skills\mcp-app-hosts"
Copy-Item -Recurse mcp-app-test   "$env:USERPROFILE\.copilot\skills\mcp-app-test"
Copy-Item -Recurse mcp-app-security "$env:USERPROFILE\.copilot\skills\mcp-app-security"
Copy-Item -Recurse mcp-app-ext    "$env:USERPROFILE\.copilot\skills\mcp-app-ext"
Copy-Item .github\agents\mcp-app-ext.agent.md "$env:USERPROFILE\.copilot\agents\mcp-app-ext.agent.md"
```

```bash
# macOS / Linux
mkdir -p ~/.copilot/skills ~/.copilot/agents
cp -r mcp-app-build  ~/.copilot/skills/mcp-app-build
cp -r mcp-app-audit  ~/.copilot/skills/mcp-app-audit
cp -r mcp-app-hosts  ~/.copilot/skills/mcp-app-hosts
cp -r mcp-app-test   ~/.copilot/skills/mcp-app-test
cp -r mcp-app-security ~/.copilot/skills/mcp-app-security
cp -r mcp-app-ext    ~/.copilot/skills/mcp-app-ext
cp .github/agents/mcp-app-ext.agent.md ~/.copilot/agents/mcp-app-ext.agent.md
```

### Claude Code

```bash
cp -r mcp-app-build mcp-app-audit mcp-app-hosts mcp-app-test mcp-app-security mcp-app-ext ~/.claude/skills/
```

### Conductor agent + MCP server

`mcp-app-ext` ships a meta-skill, an installable custom-agent file, and a
companion MCP server. Copy the `.agent.md` file to the Copilot agents directory,
then start a session with `copilot --agent mcp-app-ext`.

Build the server before registering it:

```bash
cd mcp-app-ext/mcp-server && npm install && npm run build && npm start
```

Register it globally or per workspace as stdio with `command: "node"`,
`args: ["dist/index.js"]`, and `cwd` set to the absolute installed
`mcp-app-ext/mcp-server` directory. Set `MCP_APP_SCAN_ROOTS` to the workspace
roots the scanner may inspect. See
[mcp-app-ext/README.md](mcp-app-ext/README.md).

### Gemini CLI

```bash
cp -r mcp-app-build mcp-app-audit mcp-app-hosts mcp-app-test mcp-app-security mcp-app-ext ~/.gemini/skills/
```

### Cline

```bash
cp -r mcp-app-build mcp-app-audit mcp-app-hosts mcp-app-test mcp-app-security mcp-app-ext ~/.cline/skills/
```

### Per-project

Copy the skill folders into your project directory (e.g., `.claude/skills/` or
`.copilot/skills/`) and they will be available in that workspace only.

## Verification

After installing, ask your agent:

- "Create an MCP App that shows a bar chart" → should invoke `mcp-app-build`
- "Audit my MCP App for VS Code compatibility" → should invoke `mcp-app-audit`
- "Does microphone work in VS Code?" → should invoke `mcp-app-hosts`
- "Write tests for my MCP App" → should invoke `mcp-app-test`
- "Threat-model my MCP App host" → should invoke `mcp-app-security`
- "Build an MCP App and a host to render it, end to end" → should invoke `mcp-app-ext` (Conductor)
- "Why won't my tile render / drag / theme in my web host?" → `mcp-app-hosts/host-rendering.md`

Repository quality gates:

```bash
cd mcp-app-ext/mcp-server
npm ci
npm test
npm audit --omit=dev
cd ../..
node scripts/validate-repo.mjs
node scripts/generate-host-summary.mjs --check
```

Host claims are either upstream-backed or linked to dated notes under
[`evidence/`](evidence/). See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the update
process and [`SECURITY.md`](SECURITY.md) for private vulnerability reporting.

## Related

- [MCP Apps Documentation](https://modelcontextprotocol.io/docs/extensions/apps)
- [MCP Apps SDK & Examples](https://github.com/modelcontextprotocol/ext-apps)
- [MCP Apps Quickstart](https://modelcontextprotocol.github.io/ext-apps/api/documents/Quickstart.html)
- [MCP Apps Patterns & Recipes](https://modelcontextprotocol.github.io/ext-apps/api/documents/Patterns.html)

## License

MIT

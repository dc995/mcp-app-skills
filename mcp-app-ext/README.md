# mcp-app-ext — Conductor

The **MCP Apps Extension** full-stack agent and its companion MCP server.

This adds an active layer on top of the build, audit, security, host and test
skills: a Conductor meta-skill/custom agent plus an MCP server that exposes the
matrix, validation, scanning and guidance as callable tools.

## Why this exists

The `SKILL.md` files are authoritative, but a passive markdown file can be skipped
by an arbitrary agent. `mcp-app-ext` makes the repository policy executable while keeping runtime host
claims tied to dated evidence:

- **`SKILL.md`** — *Conductor*, a router + full-stack meta-skill for the MCP Apps
  **Extension** (not a single app). It owns build/host/test/audit and composes the
  stack end to end: **MCP server → UI resource (app) → host → stateful session**.
- **`../.github/agents/mcp-app-ext.agent.md`** — Copilot custom-agent definition.
  It is discovered automatically in this repository or can be installed under
  `~/.copilot/agents/` (or `%USERPROFILE%\.copilot\agents\`).
- **`mcp-server/`** — a runnable MCP server whose tools turn the rules into checks:
  | Tool | What it does |
  |---|---|
  | `list_host_capabilities` | Returns the validated host capability matrix (all hosts or one). |
  | `check_compatibility` | Pre-build **gate**: given a host + planned features, returns PASS/BLOCKED with a safer alternative per blocker. |
  | `check_multi_host_compatibility` | Computes the capability intersection for all declared targets. |
  | `validate_host_matrix` | Validates matrix completeness, dates, schema and evidence references. |
  | `scan_app` | Bounded static scan for compatibility and security risks without returning source content. |
  | `get_guidance` | Returns the full text of a skill topic (so a host needs no skill files installed). |
  | `scaffold` | Returns canonical scaffold guidance for a stack layer (server/app/host/session). |

## The stack Conductor composes

```
session   stateful state across turns (e.g. a game, a wizard, a streamed build)
  host    web / React / desktop shell: reads ui:// resource, mounts the iframe,
          runs the postMessage handshake, themes + sandboxes the tile
  app     the UI resource (bundled HTML/JS/CSS)
  server  MCP server: tools + the ui:// resource (_meta.ui.resourceUri)
```

## Using the agent

Conductor routes to all sibling skills, so install the complete skill set. From
the repository root:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.copilot\skills" | Out-Null
New-Item -ItemType Directory -Force "$env:USERPROFILE\.copilot\agents" | Out-Null
Copy-Item -Recurse mcp-app-build "$env:USERPROFILE\.copilot\skills\mcp-app-build"
Copy-Item -Recurse mcp-app-audit "$env:USERPROFILE\.copilot\skills\mcp-app-audit"
Copy-Item -Recurse mcp-app-security "$env:USERPROFILE\.copilot\skills\mcp-app-security"
Copy-Item -Recurse mcp-app-hosts "$env:USERPROFILE\.copilot\skills\mcp-app-hosts"
Copy-Item -Recurse mcp-app-test "$env:USERPROFILE\.copilot\skills\mcp-app-test"
Copy-Item -Recurse mcp-app-ext "$env:USERPROFILE\.copilot\skills\mcp-app-ext"
Copy-Item .github\agents\mcp-app-ext.agent.md "$env:USERPROFILE\.copilot\agents\mcp-app-ext.agent.md"
```

```bash
mkdir -p ~/.copilot/skills ~/.copilot/agents
cp -r mcp-app-build mcp-app-audit mcp-app-security mcp-app-hosts mcp-app-test mcp-app-ext ~/.copilot/skills/
cp .github/agents/mcp-app-ext.agent.md ~/.copilot/agents/mcp-app-ext.agent.md
```

Then start a session with the Copilot CLI:

```bash
copilot --agent mcp-app-ext
```

Conductor will route to the right skill and, if the companion server is
connected, call its tools to evaluate recorded capabilities and scan the target.
A PASS is evidence-backed policy evaluation, not proof of an untested host.

## Running the MCP server

From the repository root:

```bash
cd mcp-app-ext/mcp-server
npm install
npm run build
npm start          # stdio transport
```

Register it with your host (stdio):

```json
{
  "mcp-app-ext": {
    "type": "stdio",
    "command": "node",
    "args": ["dist/index.js"],
    "cwd": "<absolute path to>/mcp-app-ext/mcp-server",
    "env": {
      "MCP_APP_SCAN_ROOTS": "<absolute workspace root>"
    }
  }
}
```

The server reads the repo's own `mcp-app-hosts/host-matrix.json` and skill files as
its source of truth. `scan_app` is restricted to the path-list in
`MCP_APP_SCAN_ROOTS` (use the platform path delimiter for multiple roots).

## Extending

Remaining extension points:

- `scaffold` — return ready-to-write file contents (parameterized by name / port /
  framework) instead of only the guidance text.
- Add a `cross_host_check` tool that runs the mcp-app-test layers and returns a
  green/red matrix per host.
- Add a `probe_host` tool that records versioned runtime evidence without
  automatically changing the matrix.

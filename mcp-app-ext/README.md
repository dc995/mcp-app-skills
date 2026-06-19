# mcp-app-ext — Conductor

The **MCP Apps Extension** full-stack agent and its companion MCP server.

This adds an *active* layer on top of the four reference skills (build / audit /
hosts / test): an **agent persona** that composes the whole stack, and an
**MCP server** that exposes the skills' rules as callable tools — so any agent
gets the behavior by *sensing* reality, not by being trusted to have read the
instructions.

## Why this exists

The `SKILL.md` files are authoritative, but a passive markdown file can be skipped
by an arbitrary agent. `mcp-app-ext` makes the knowledge **executable and
verifiable**:

- **`AGENT.md`** — *Conductor*, a router + full-stack persona for the MCP Apps
  **Extension** (not a single app). It owns build/host/test/audit and composes the
  stack end to end: **MCP server → UI resource (app) → host → stateful session**.
- **`mcp-server/`** — a runnable MCP server whose tools turn the rules into checks:
  | Tool | What it does |
  |---|---|
  | `list_host_capabilities` | Returns the validated host capability matrix (all hosts or one). |
  | `check_compatibility` | Pre-build **gate**: given a host + planned features, returns PASS/BLOCKED with a safer alternative per blocker. |
  | `get_guidance` | Returns the full text of a skill topic (so a host needs no skill files installed). |
  | `scaffold` | Returns the canonical scaffold guidance for a stack layer (server/app/host/session). |

## The stack Conductor composes

```
session   stateful state across turns (e.g. a game, a wizard, a streamed build)
  host    web / React / desktop shell: reads ui:// resource, mounts the iframe,
          runs the postMessage handshake, themes + sandboxes the tile
  app     the UI resource (bundled HTML/JS/CSS)
  server  MCP server: tools + the ui:// resource (_meta.ui.resourceUri)
```

## Using the agent

Install the agent the same way as the skills (copy into your agent host's agents
or skills directory), then start a session as Conductor — e.g. with the Copilot
CLI:

```bash
copilot --agent mcp-app-ext
```

Conductor will route to the right skill and, **if the `mcp-app-ext` MCP server is
connected**, call its tools to sense compatibility/validity before acting.

## Running the MCP server

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
    "cwd": "<absolute path to>/mcp-app-ext/mcp-server"
  }
}
```

The server reads the repo's own `mcp-app-hosts/host-matrix.json` and skill files as
its source of truth, so it stays in sync with the markdown.

## Extending

The server is a **skeleton** with clear extension points:

- `check_compatibility` — add static scanning of an app directory (grep for `eval`,
  external `<script src>`, `fetch(` to non-localhost) and report findings as
  blockers, turning the pre-build gate into a post-build audit too.
- `scaffold` — return ready-to-write file contents (parameterized by name / port /
  framework) instead of only the guidance text.
- Add a `cross_host_check` tool that runs the mcp-app-test layers and returns a
  green/red matrix per host.

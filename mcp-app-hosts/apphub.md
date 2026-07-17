# AppHub Host — Custom MCP App Host

AppHub is the first-party custom-host validation pattern from which several
lessons in this repository were distilled. It connects to multiple MCP servers,
proxies tools/resources and renders their UIs in browser tiles.

## Architecture

```
Browser → AppHub (Express, port 3009/4009)
            ├── REST API (/api/servers, /api/tools, /api/splash, /api/state)
            ├── MCP Proxy (persistent Client connections to all downstream servers)
            ├── Tile Grid (iframes with postMessage bridge per app)
            └── Agent (optional LLM agent for chain execution)
```

## Capabilities

AppHub is a permissive **first-party validation host**. Its original configuration
assumes reviewed apps; it is not a safe template for rendering arbitrary
third-party MCP resources.

- `eval()` / `new Function()`: **Yes**
- External `<script src>` CDN: **Yes**
- External `fetch()`: **Yes**
- Browser permission APIs: available only when host policy and user/OS consent allow
- `connect-src`: permissive in the validation harness; production hosts should
  enforce per-resource and administrator policy

For approved-partner or open-ecosystem servers, use the different-origin sandbox
architecture in `host-security.md` rather than the original same-origin `srcdoc`
prototype.

## PostMessage Protocol

AppHub implements the MCP Apps postMessage JSON-RPC protocol manually (not using AppBridge):

1. Load MCP App HTML into iframe via `srcdoc`
2. App sends `ui/initialize` request
3. Host responds with `hostCapabilities`, `hostContext` (MUST use `hostCapabilities` not `capabilities`)
4. App sends `ui/notifications/initialized` — **this is the render-ready signal**
5. Host sends `ui/notifications/tool-input` with tool arguments
6. Host sends `ui/notifications/tool-result` with `CallToolResult`
7. App can call `tools/call`, `tools/list`, `resources/read` → host proxies to MCP server

### Critical: Handshake field name
The response field is `hostCapabilities` NOT `capabilities`. The App SDK validates with Zod — wrong field name causes silent failure.

### Critical: Timing
Do NOT send `tool-input` before receiving `ui/notifications/initialized`. The App is not ready until it sends this notification.

## Sample launch system

The validation harness used reviewed sample arguments for each server. A
production host should keep sample calls non-destructive and subject to the same
tool authorization as normal calls.

## Testing Against AppHub

AppHub exposes REST API endpoints useful for testing:
- `GET /api/servers` — list connected servers with status
- `GET /api/tools` — flattened tool list across all servers
- `POST /api/tools/call` — proxy tool calls to any connected server
- `POST /api/splash/:serverId` — execute splash for a specific server
- `GET /api/state`, `PUT /api/state`, `DELETE /api/state` — shared state management

## Reference component boundaries

| Component | Purpose |
|---|---|
| Host HTTP service | Authenticated REST surface and static host UI |
| MCP proxy | Client connections to approved downstream servers |
| Server registry | IDs, endpoints, tools, trust policy and status |
| Sample definitions | Reviewed demonstration inputs |
| Tile renderer | Different-origin iframe bridge and lifecycle |

The original harness is not shipped here. Reproduce portable behavior from these
components and the evidence note in `evidence/custom-hosts-2026-06.md`.

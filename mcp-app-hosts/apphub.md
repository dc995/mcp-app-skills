# AppHub Host — Custom MCP App Host

AppHub is a custom MCP App host built in this workspace (`AppHubMCPapp/`). It runs as a web application that connects to multiple MCP servers and renders their UIs in iframes with full browser capabilities.

## Architecture

```
Browser → AppHub (Express, port 3009/4009)
            ├── REST API (/api/servers, /api/tools, /api/splash, /api/state)
            ├── MCP Proxy (persistent Client connections to all downstream servers)
            ├── Tile Grid (iframes with postMessage bridge per app)
            └── Agent (optional LLM agent for chain execution)
```

## Capabilities

AppHub is the **most permissive** validated host: full browser environment, minimal iframe sandbox, all APIs available.

- `eval()` / `new Function()`: **Yes**
- External `<script src>` CDN: **Yes**
- External `fetch()`: **Yes**
- All browser permission APIs: **Yes** (subject to user/OS consent)
- `connect-src`: unrestricted

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

## Splash System

AppHub has a splash screen system (`splash-definitions.ts`) that pre-defines sample tool arguments for each server. "Launch All Splash" fires sample tool calls to all servers simultaneously, rendering their UIs with demo data.

## Port Configuration

- HTTP: 3009
- TLS: 4009
- Downstream servers connected on their HTTP ports (3xxx) — internal network, no TLS needed

## Testing Against AppHub

AppHub exposes REST API endpoints useful for testing:
- `GET /api/servers` — list connected servers with status
- `GET /api/tools` — flattened tool list across all servers
- `POST /api/tools/call` — proxy tool calls to any connected server
- `POST /api/splash/:serverId` — execute splash for a specific server
- `GET /api/state`, `PUT /api/state`, `DELETE /api/state` — shared state management

## Key Files

| File | Purpose |
|---|---|
| `AppHubMCPapp/main.ts` | Express server, REST API |
| `AppHubMCPapp/mcp-proxy.ts` | MCP Client connections to downstream servers |
| `AppHubMCPapp/mcp-registry.ts` | Server registry (IDs, ports, tools) |
| `AppHubMCPapp/splash-definitions.ts` | Per-app splash metadata + sample tool args |
| `AppHubMCPapp/public/index.html` | Frontend with iframe bridge, tile grid, agent UI |

# Debugging MCP Apps

## Tool 1: ui-inspector (MCP Inspector with UI support)

Fork of MCP Inspector by Ido Salomon — adds MCP App UI rendering for visual debugging.

### Setup
```bash
npx @modelcontextprotocol/inspector node build/index.js
# Or connect to a running server:
npx @modelcontextprotocol/inspector --config path/to/config.json
```

Opens at `http://localhost:6274`. Proxy runs at `http://localhost:6277`.

### What It Does
- Lists tools, resources, prompts from your server
- Call tools interactively with form-based parameter input
- View response JSON
- CLI mode for scripting: `npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list`

### When to Use
- Verifying tool schemas and responses before testing in a host
- Debugging protocol-level issues (transport, session handling)
- Comparing expected vs actual tool output

## Tool 1.5: basic-host Debug Panels (ext-apps reference host)

The ext-apps `basic-host` is the fastest first-pass debugging surface — a standard browser
page (no Electron/webview origin quirks) that renders your App in a sandboxed iframe. Start it
pointed at your server and open `http://localhost:8080`:

```bash
cd examples/basic-host          # from a clone of modelcontextprotocol/ext-apps
SERVERS='["http://localhost:3001/mcp"]' npm start   # list multiple URLs to connect several servers
```

Its collapsible panels expose every layer of the App protocol:

| Panel | Shows |
|---|---|
| **Tool Input** | The JSON input sent to your tool |
| **Tool Result** | The result your tool returned |
| **Messages** | Messages your App sent to the model (`updateModelContext`) |
| **Model Context** | Context updates the App pushed to the host |

For more, open the browser console — basic-host logs key events (server connections, tool
calls, App init, App→host requests) with a **`[HOST]`** prefix. Use this to confirm the
protocol round-trip *before* chasing host-specific CSP failures in VS Code.
Source: [ext-apps testing guide](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/testing-mcp-apps.md).

## Tool 2: VS Code DevTools

The iframe's console output IS visible in VS Code DevTools.

### Access
1. Help → Toggle Developer Tools (or `Ctrl+Shift+I`)
2. Console tab → look for `[MCP-APP]` prefixed messages from the App SDK
3. Network tab → check for blocked requests (CSP violations show as red)

### What to Look For
- **CSP errors**: `Refused to load the script...`, `Refused to connect to...`
- **Permission errors**: `DOMException: Permission denied`, `NotAllowedError`
- **Bridge errors**: `Invalid input` (usually wrong field name in protocol response)
- **Zod validation**: `McpUiInitializeResultSchema` failures (missing `hostCapabilities`)

## Tool 3: app.sendLog()

Send debug messages from UI to the host application log:

```typescript
await app.sendLog({ level: "info", data: "Bridge initialized" });
await app.sendLog({ level: "error", data: { error: sanitizeError(err) } });
```

In AppHub, these appear in the Activity Log panel. In VS Code, check Output → MCP.
Never log tokens, authorization headers, cookies, full tool payloads or private
filesystem paths.

## Tool 4: PostMessage Tracing

Add a message listener to trace all iframe↔host communication:

```typescript
// In the host page (e.g., AppHub index.html)
window.addEventListener("message", (event) => {
  if (event.source !== debugIframe.contentWindow) return;
  if (!event.data || typeof event.data !== "object") return;
  console.log("[POSTMESSAGE]", event.data);
});
```

Do not install an unfiltered global listener in production. The debug bridge
must use the same source, schema and size validation as the real host bridge.

### Common Protocol Issues

| Symptom | Cause | Fix |
|---|---|---|
| Iframe blank, no errors | `ui/initialize` response malformed | Check `hostCapabilities` field name (not `capabilities`) |
| "Invalid input" in console | Zod schema validation failed | Verify response matches `McpUiInitializeResultSchema` |
| Tool input never arrives | Sent before `ui/notifications/initialized` | Wait for initialized notification before sending tool-input |
| App hangs on connect | Handler registered after `app.connect()` | Register ALL handlers BEFORE `connect()` |
| CSP error on script load | External `<script src>` in VS Code | Bundle via npm + vite-plugin-singlefile |
| Network request blocked | External `fetch()` in VS Code | Proxy through server via `app.callServerTool()` |

## Debugging Decision Tree

```
App doesn't render at all?
  → Check DevTools Console for CSP errors
  → Check iframe has content (View Source on iframe)
  → Verify ui/initialize response format

App renders but no data?
  → Check tool-input timing (after initialized?)
  → Verify ontoolinput handler registered before connect()
  → Check app.sendLog() output

App works in AppHub but not VS Code?
  → Almost certainly CSP/sandbox issue
  → Check mcp-app-hosts/vscode.md for blocked features
  → Look for eval, CDN scripts, external fetch in your code

App works first time but breaks on refresh?
  → State management issue
  → Check viewUUID / localStorage lifecycle
```

## "fetch failed" on Tool Call (Server-Connection Triage)

A tool call that returns `fetch failed` is a **transport** problem, not an app bug.
The host usually cached a failed connection from when the server was down; starting
the server afterward doesn't clear it.

### Step 1 — Is the server actually up and healthy?

Verify independently of the host using the exact configured endpoint:

```powershell
Invoke-WebRequest -Uri 'https://localhost:<TLS_PORT>/mcp' -Method POST `
  -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' `
  -ContentType 'application/json' `
  -Headers @{Accept='application/json, text/event-stream'} -TimeoutSec 10
```

- **`200` + `event: message` body** → server is fine. The host has a **stale
  connection** → reconnect (Step 2).
- **Connection refused / timeout** → server is **down** or on the wrong port/scheme
  (Step 3).

### Step 2 — Reconnect a stale host connection

Command Palette → **MCP: List Servers** → select the server → **Restart**. Only
then does the next tool call succeed.

### Step 3 — Server down or wrong endpoint

- Start the target project's existing server task, or let the host spawn a stdio
  server.
- Confirm the configured URL matches the listening scheme, address, port and path.

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
await app.sendLog({ level: "error", data: { error: err.message, stack: err.stack } });
```

In AppHub, these appear in the Activity Log panel. In VS Code, check Output → MCP.

## Tool 4: PostMessage Tracing

Add a message listener to trace all iframe↔host communication:

```typescript
// In the host page (e.g., AppHub index.html)
window.addEventListener("message", (event) => {
  console.log("[POSTMESSAGE]", event.origin, JSON.parse(event.data));
});
```

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

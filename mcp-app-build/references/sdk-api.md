# MCP Apps SDK — Quick API Reference

## Server Side (`@modelcontextprotocol/ext-apps/server`)

### registerAppTool
```typescript
registerAppTool(server, toolName, {
  title: string,
  description: string,
  inputSchema: ZodSchema | {},
  _meta: {
    ui: {
      resourceUri: string,          // "ui://tool-name/mcp-app.html"
      visibility?: ("model"|"app")[], // default: ["model","app"]
    }
  },
}, handler: (args) => Promise<CallToolResult>);
```

### registerAppResource
```typescript
registerAppResource(server, uri, uri, {
  mimeType: RESOURCE_MIME_TYPE,     // "text/html;profile=mcp-app"
}, readCallback: () => Promise<ReadResourceResult>);
```

The `_meta.ui.csp` goes in the `contents[]` objects returned by the read callback, NOT in registerAppResource's config:
```typescript
return {
  contents: [{
    uri, mimeType: RESOURCE_MIME_TYPE, text: html,
    _meta: {
      ui: {
        csp: {
          connectDomains: ["https://api.example.com"],
          resourceDomains: ["https://static.example.com"],
          frameDomains: [],
          baseUriDomains: []
        },
        permissions: {
          clipboardWrite: {}
        }
      }
    }
  }]
};
```

### RESOURCE_MIME_TYPE
`"text/html;profile=mcp-app"` — identifies MCP App HTML resources. Import and
use `RESOURCE_MIME_TYPE` rather than duplicating the literal.

## Client Side (`@modelcontextprotocol/ext-apps`)

### App class
```typescript
const app = new App({
  name: string,
  version: string,
  capabilities?: { /* declared capabilities */ }
});

// Handlers — register BEFORE connect()
app.ontoolinput = (params: Record<string, unknown>) => void;
app.ontoolinputpartial = (params: Record<string, unknown>) => void;
app.ontoolresult = (result: CallToolResult) => void;
app.onhostcontextchanged = (ctx: McpUiHostContext) => void;
app.onteardown = () => Promise<{ state?: unknown }>;

await app.connect();

// Methods
await app.callServerTool({ name: string, arguments: Record<string, unknown> });
await app.updateModelContext({ content: Content[] });
await app.sendMessage({ content: Content[] });
await app.sendLog({ level: "info"|"warn"|"error", data: unknown });
const caps = app.getHostCapabilities(); // HostCapabilities | undefined
```

### React hooks (`@modelcontextprotocol/ext-apps/react`)
```typescript
const { app, toolInput, toolResult, hostContext } = useApp({
  appInfo: { name, version },
  capabilities: {},
  onAppCreated: (app) => { /* register extra handlers */ },
});

useHostStyles(app);  // Auto-applies theme, style variables, fonts to document
```

## Host Protocol (for building custom hosts)

### ui/initialize response
```json
{
  "result": {
    "protocolVersion": "2026-01-26",
    "hostInfo": { "name": "MyHost", "version": "1.0.0" },
    "hostCapabilities": {
      "openLinks": {}, "serverTools": {}, "serverResources": {}, "logging": {}
    },
    "hostContext": {
      "theme": "dark", "displayMode": "inline",
      "containerDimensions": { "width": 380, "maxHeight": 600 }
    }
  }
}
```

**CRITICAL**: field is `hostCapabilities` NOT `capabilities`. Zod validation fails silently with wrong name.

### Render-ready signal
`ui/notifications/initialized` from the App = handshake complete, ready for tool-input.

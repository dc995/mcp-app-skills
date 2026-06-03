# MCP App Patterns

## Handler Registration — BEFORE connect()

Register ALL handlers before calling `app.connect()`:

```typescript
const app = new App({ name: "My App", version: "1.0.0" });

app.ontoolinput = (params) => { renderFromData(params); };
app.ontoolinputpartial = (params) => { renderPreview(params); };
app.ontoolresult = (result) => { handleResult(result); };
app.onhostcontextchanged = (ctx) => { applyTheme(ctx); };
app.onteardown = async () => { cleanup(); return {}; };

await app.connect();
```

## Data-Driven Rendering (PRESCRIPTIVE for VS Code)

**ALWAYS use structured data input, NOT code strings**, when targeting VS Code or multi-host.

### Wrong — code-as-input
```typescript
inputSchema: { code: z.string().describe("JS code to render") }
// Model sends: { code: "const scene = new THREE.Scene()..." }
// UI runs: new Function(code)()  ← CSP blocks in VS Code
```

### Correct — data-as-input
```typescript
inputSchema: {
  chart: z.object({
    type: z.enum(["bar", "pie", "scatter"]),
    title: z.string().optional(),
    data: z.array(z.object({
      name: z.string(),
      value: z.number(),
      color: z.string().optional(),
    })),
  }),
}
// Model sends: { chart: { type: "bar", data: [...] } }
// UI calls: renderBarChart(canvas, chart)  ← No eval, works everywhere
```

### Fallback Hierarchy
1. Structured `chart`/`data` provided → use pre-built renderer (all hosts)
2. `code` string provided + eval succeeds → dynamic renderer (permissive hosts)
3. `code` string provided + eval blocked → default fallback (VS Code)
4. Nothing provided → default scene

## Tool Visibility

```typescript
// Both model and app can call (default)
_meta: { ui: { resourceUri, visibility: ["model", "app"] } }

// UI-only — hidden from model (refresh buttons, internal tools)
_meta: { ui: { resourceUri, visibility: ["app"] } }

// Model-only — app cannot call
_meta: { ui: { resourceUri, visibility: ["model"] } }
```

## Host Styling

**Vanilla JS:**
```typescript
import { applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from "@modelcontextprotocol/ext-apps";

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
};
```

**React:**
```typescript
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
const { app } = useApp({ appInfo, capabilities, onAppCreated });
useHostStyles(app);
```

**CSS variables available after applying:**
```css
.container {
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  border-radius: var(--border-radius-md);
}
```

## Server-Proxied External Data

When UI needs external data but can't fetch directly (VS Code CSP):

```typescript
// server.ts — register app-only tool
registerAppTool(server, "fetch-data", {
  title: "Fetch Data",
  inputSchema: { query: z.string() },
  _meta: { ui: { resourceUri, visibility: ["app"] } },
}, async ({ query }) => {
  const resp = await fetch(`https://api.example.com/search?q=${encodeURIComponent(query)}`);
  const data = await resp.json();
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

// UI — call via MCP bridge (works through iframe sandbox)
const result = await app.callServerTool({ name: "fetch-data", arguments: { query: "test" } });
```

## OAuth / Authenticated APIs (Server-Side Flow)

In restricted hosts the UI cannot pop a window (`window.open()` returns `null`)
or hold provider tokens, so the entire OAuth flow lives on the **server** and the
UI just polls for completion. Build it this way once — it's portable across all
hosts.

```typescript
// server.ts — Express routes own the OAuth dance (Authorization Code + PKCE)
app.get("/auth/start", (_req, res) => {
  const url = buildAuthorizeUrl({ redirectUri: `${BASE_URL}/auth/callback`, pkce });
  res.redirect(url);                       // user follows this in their real browser
});
app.get("/auth/callback", async (req, res) => {
  const tokens = await exchangeCode(req.query.code, pkce);
  saveTokensServerSide(tokens);            // tokens NEVER leave the server
  res.send("<p>Signed in. You can close this tab.</p>");
});

// app-only status tool the UI can poll through the MCP bridge
registerAppTool(server, "auth", {
  inputSchema: { action: z.enum(["status"]) },
  _meta: { ui: { resourceUri, visibility: ["app"] } },
}, async () => ({
  content: [{ type: "text", text: isAuthenticated() ? "ok" : "pending" }],
  _meta: { authenticated: isAuthenticated() },  // boolean only, no token
}));
```

```typescript
// UI — render a normal link to /auth/start (no window.open), then poll
const timer = setInterval(async () => {
  const res = await app.callServerTool({ name: "auth", arguments: { action: "status" } });
  const meta = (res as Record<string, unknown>)._meta as Record<string, unknown> | undefined;
  if (meta?.authenticated) { clearInterval(timer); render(); }
}, 2000);
```

**Rules:** access/refresh tokens stay server-side; the UI only ever sees a boolean
and any non-sensitive profile fields the server chooses to surface; credentials
(client secret, etc.) come from environment variables, never hardcoded. Validated
with an Authorization-Code-+-PKCE provider login driven entirely from server routes.

## Streaming Preview

Show partial rendering while the model is still generating:

```typescript
app.ontoolinputpartial = (params) => {
  // Render what we have so far — reduces perceived latency
  if (params.chart?.data) renderChart(params.chart);
};

app.ontoolinput = (params) => {
  // Final render with complete data
  renderChart(params.chart);
};
```

## Update Model Context from UI

Keep the model informed of user interactions:

```typescript
await app.updateModelContext({
  content: [{ type: "text", text: "User selected region: EMEA, value: $380K" }],
});
```

## Pause Animations When Offscreen

```typescript
const observer = new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting) startAnimationLoop();
  else stopAnimationLoop();
});
observer.observe(document.getElementById("canvas")!);
```

## Runtime Host Detection

```typescript
const caps = app.getHostCapabilities();

if (caps?.sandbox?.permissions?.microphone) {
  enableMicFeature();
} else {
  showTextInputFallback();
}

// CSP eval check
let canEval = false;
try { new Function("return 1")(); canEval = true; } catch {}
```

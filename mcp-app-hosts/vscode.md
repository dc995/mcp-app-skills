# VS Code Host — MCP App Constraints

VS Code Insiders renders MCP App UIs in a heavily sandboxed iframe with the most restrictive CSP of any MCP host.

## CSP Policy

```
script-src 'self' 'unsafe-inline'
```

- `unsafe-eval` is **NOT** allowed
- `unsafe-inline` IS allowed (inline `<script>` tags work)
- External `<script src="https://...">` is **BLOCKED**
- External `<link href="https://...">` for CSS is **BLOCKED**

## What This Blocks

### 1. Dynamic Code Execution
- `eval("code")` → CSP violation
- `new Function("code")` → CSP violation
- `setTimeout("string", ms)` → CSP violation
- Third-party libs using these internally (Knockout.js, Angular 1.x)

### 2. External CDN Loading
- `<script src="https://cdn.example.com/lib.js">` → blocked by script-src
- `<link href="https://cdn.example.com/style.css">` → blocked by style-src
- **This is the core gap for vendor-CDN SDKs**: any library whose canonical install is a `<script>` tag pointing at a vendor CDN cannot load. This commonly affects hosted map/geo SDKs and other vendor visualization SDKs that ship as a CDN script.
- **The deeper trap**: even if you manage to npm-bundle such a library, many still **fetch assets at runtime** (map tiles, fonts, sprites, style JSON) from vendor domains — which `connect-src 'self'` also blocks (see §3). A library is only viable in VS Code if it both bundles cleanly *and* needs no runtime vendor fetches (or routes those through the server).

### 3. External Network Requests from UI
- `fetch("https://external-api.com/data")` → blocked by connect-src
- Even if `_meta.ui.csp.connectDomains` declares allowed domains, VS Code does not honor CSP relaxation requests
- **Workaround**: proxy through MCP server (server.ts fetches, returns via tool result)

### 4. Browser Permission APIs
- Microphone (`getUserMedia({audio})`) → denied
- Camera (`getUserMedia({video})`) → denied
- Geolocation (`navigator.geolocation`) → denied
- Web Speech API (`SpeechRecognition`) → denied
- Even declaring `_meta.ui.permissions` has no effect today

### 5. Popups / New Windows (breaks naive OAuth)
- `window.open(...)` → returns `null` in the sandboxed iframe; no popup appears
- This breaks the common OAuth pattern of opening the provider's authorize page in a popup and waiting for it to post back a token
- **Workaround**: run the OAuth flow on the **server**, not in the UI — see "OAuth in a Restricted Host" below

### 6. Secure Context Requirements
- `vscode-webview://` origin IS treated as secure context
- But browser APIs like Translation API, Web Bluetooth, Web NFC still require iframe permission grants that VS Code doesn't provide

## What Works

| Feature | Notes |
|---|---|
| Canvas 2D / WebGL | Full support — Three.js, Chart.js, D3 canvas all work |
| DOM manipulation | Full support |
| CSS animations / variables | Full support, host style variables available |
| Inline `<script>` | Allowed by `unsafe-inline` |
| npm-bundled code (vite-plugin-singlefile) | The required approach — all JS/CSS inlined |
| `postMessage` (MCP bridge) | Full support — `app.callServerTool()`, `app.updateModelContext()` |
| Web Workers (inline/blob) | Supported |
| WebSockets | Supported (via server proxy) |
| `<img src>` to external URLs | Generally works (img-src is more permissive) — this is why Leaflet tiles load |

## Port and TLS Configuration

VS Code connects to MCP servers via TLS. Convention in this workspace:
- HTTP port: `3xxx` (e.g., 3006 for GetTime)
- TLS port: `3xxx + 1000` (e.g., 4006)
- `.vscode/mcp.json` points to TLS ports

## Known Pattern Compatibility

| Pattern | Works? | Why |
|---|---|---|
| npm-bundled canvas/WebGL/SVG rendering | **Yes** | No string-to-code; bundled by vite-singlefile |
| Data-driven 3D / charting (structured input → pre-built renderer) | **Yes** | No eval; renderer compiled at build time |
| Map library whose tiles load as `<img>` and that npm-bundles cleanly | **Yes** | `img-src` is permissive, so raster tiles load |
| Web components / view libs that template without eval | **Yes** | No `new Function()` |
| Vendor map/geo SDK loaded from a CDN + runtime vendor tile/asset fetches | **No** | CDN `<script>` blocked AND runtime `connect-src` blocked |
| GL/worker map renderer that compiles styles via eval or blob-eval workers | **No** | eval blocked under CSP |
| MVVM/templating libs that compile bindings via `new Function()` | **No** | string-to-code blocked |
| Frameworks with eval-based template compilation | **No** | eval blocked under CSP |
| Large geo/3D engines that bundle widgets using a string-binding system | **Partial** | Disable the eval-using widgets; core renderer may still work |

> Don't memorize product names — reason about the **mechanism**. If a library (a) loads from a vendor CDN, (b) evaluates strings as code, or (c) fetches assets from external domains at runtime, it will hit a wall in VS Code. If it bundles cleanly and renders without any of those, it works.

## Workaround Patterns

### CDN SDK → npm bundle
```
# Instead of: <script src="https://cdn.example.com/lib.js">
npm install the-library
# Import in src/mcp-app.ts → Vite bundles into single HTML
```

### External fetch → server proxy
```typescript
// Instead of UI fetching: fetch("https://api.example.com/data")
// UI calls: app.callServerTool({ name: "fetch-data", arguments: { query } })
// Server fetches: await fetch("https://api.example.com/data", { headers })
```

### eval/new Function → data-driven rendering
```typescript
// Instead of: new Function(codeFromModel)()
// Use structured input: { chart: { type: "bar", data: [...] } }
// Pre-built renderer: renderBarChart(canvas, data)
```

### Permission API → fallback UI
```typescript
const caps = app.getHostCapabilities();
if (caps?.sandbox?.permissions?.microphone) {
  startMicrophoneFeature();
} else {
  showTextInputFallback();
}
```

## OAuth in a Restricted Host

`window.open()` returns `null` in the VS Code iframe, so the popup-based OAuth
dance (open authorize URL → read token in a popup → postMessage it back) does not
work. The portable fix is to **keep the entire OAuth flow on the server** and let
the UI poll for completion. This pattern is host-agnostic — it also works in
permissive hosts, so build it this way once.

**Shape of the flow:**

1. **Server owns OAuth.** The MCP server (Express) exposes provider-neutral routes:
   - `GET /auth/start` → redirects the browser to the provider's authorize URL
     (Authorization Code + PKCE; `redirect_uri` points back at the server)
   - `GET /auth/callback` → exchanges the code for tokens, stores them
     **server-side only**, and renders a "you can close this tab" page
   - `GET /auth/status` → returns `{ authenticated: boolean }`
2. **UI starts auth without a popup.** Render a normal link/button whose href is
   the server's `/auth/start` URL (the user follows it in their real browser, where
   they're already signed in). Do **not** rely on `window.open()`.
3. **UI polls for completion** via an app-only MCP tool — never via the token:
   ```typescript
   // Poll the server through the MCP bridge (works inside the sandbox)
   const timer = setInterval(async () => {
     const res = await app.callServerTool({ name: "auth", arguments: { action: "status" } });
     const meta = (res as Record<string, unknown>)._meta as Record<string, unknown> | undefined;
     if (meta?.authenticated) { clearInterval(timer); render(); }
   }, 2000);
   ```
4. **Tokens never reach the UI.** Access/refresh tokens live only on the server.
   The UI sees a boolean and any non-sensitive profile fields the server chooses to
   surface via the tool result `_meta`. Credentials come from environment variables,
   never hardcoded.

> Validated with an Authorization-Code-+-PKCE provider login driven entirely from
> server routes, with the UI polling an app-only `status` tool. Because the token
> exchange happens server-side, the CSP/`window.open` limitations of the iframe
> never come into play.

## "fetch failed" — Server Up but Host Won't Connect

When a tool call returns `fetch failed` even though the server is running, the host
has usually **cached a failed connection** from when the server was down. Starting
the server afterward is not enough.

1. **Verify the server is actually healthy** (independent of the host):
   ```powershell
   Invoke-WebRequest -Uri 'https://localhost:<TLS_PORT>/mcp' -Method POST `
     -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' `
     -ContentType 'application/json' `
     -Headers @{Accept='application/json, text/event-stream'} -TimeoutSec 10
   ```
   A `200` with an `event: message` body = the server is fine; the problem is the
   host's cached connection.
2. **Reconnect in the host**: Command Palette → **MCP: List Servers** → pick the
   server → **Restart**. Only then will the next tool call succeed.
3. **TLS must match `mcp.json`.** Entries use `https://localhost:<HTTP+1000>`. A
   server started *without* TLS only listens on plain HTTP, so the `https://` URL
   fails. The TLS port is always **HTTP port + 1000**.

## Runtime Host Detection

```typescript
const app = new App({ name: "My App", version: "1.0.0" });
await app.connect();
const caps = app.getHostCapabilities();

// Check CSP
const canEval = caps?.sandbox?.csp?.connectDomains !== undefined; // rough proxy
// Better: try/catch eval
try { new Function("return 1")(); } catch { /* VS Code */ }

// Check permissions
if (!caps?.sandbox?.permissions?.microphone) {
  showFallbackUI("Microphone not available in this host");
}
```

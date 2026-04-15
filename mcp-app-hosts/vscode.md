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
- **This is why Azure Maps SDK fails** — it requires loading `atlas.min.js` from `atlas.microsoft.com`
- **This is why Google Maps JS API fails** — requires CDN script tag

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

### 5. Secure Context Requirements
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

## Known SDK Compatibility

| SDK | Works? | Issue |
|---|---|---|
| Leaflet | **Yes** | npm-bundled, tiles load as `<img>` |
| Three.js | **Yes** | npm-bundled, data-driven (no eval) |
| Chart.js | **Yes** | npm-bundled, canvas rendering |
| D3 | **Yes** | npm-bundled, SVG/canvas |
| Lit / Web Components | **Yes** | npm-bundled, no eval |
| Azure Maps SDK | **No** | Requires CDN `<script>` + runtime tile fetches |
| Google Maps JS API | **No** | Requires CDN `<script>` + API key in URL |
| Mapbox GL JS | **No** | Web workers + eval for style parsing |
| CesiumJS (with widgets) | **Partial** | Knockout widgets use eval; disable `selectionIndicator` + `infoBox` |
| Knockout.js | **No** | `new Function()` for data-bind parsing |
| Angular 1.x | **No** | eval-based template compilation |

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

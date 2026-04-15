---
name: mcp-app-audit
description: "Audit and rewrite existing MCP Apps for host compatibility. Review apps for CSP violations, external CDN dependencies, eval usage, blocked permission APIs, and provide specific rewrite patterns. WHEN: 'audit my MCP App', 'review MCP app compatibility', 'why does my app break in VS Code', 'rewrite for VS Code', 'fix CSP errors', 'make my MCP app work everywhere', 'check host compatibility'."
---

# MCP App Audit

Review existing MCP Apps for host compatibility issues and get specific rewrite guidance.

## When to Use

- You have an MCP App that works in one host but not another
- You're evaluating whether a third-party example app will work in VS Code
- You want to make an existing app multi-host compatible
- You're reviewing upstream ext-apps examples before adopting them

## Audit Process

### Step 1: Scan for Red Flags

Check these files in the app:

**`mcp-app.html`** — look for:
- [ ] `<script src="https://...">` — external CDN scripts (**BLOCKED** in VS Code)
- [ ] `<link href="https://...">` — external CDN stylesheets (**BLOCKED** in VS Code)
- [ ] `<iframe src="https://...">` — nested iframes (**BLOCKED** in VS Code)

**`src/mcp-app.ts` (or .tsx)** — look for:
- [ ] `eval(...)` — dynamic code execution (**BLOCKED** in VS Code)
- [ ] `new Function(...)` — dynamic code execution (**BLOCKED** in VS Code)
- [ ] `setTimeout("string", ...)` — string-form setTimeout (**BLOCKED** in VS Code)
- [ ] `fetch("https://external-domain...")` — external API calls (**BLOCKED** in VS Code)
- [ ] `navigator.mediaDevices.getUserMedia` — microphone/camera (**BLOCKED** in VS Code)
- [ ] `navigator.geolocation` — geolocation (**BLOCKED** in VS Code)
- [ ] `new SpeechRecognition()` — Web Speech API (**BLOCKED** in VS Code)

**`package.json`** — look for:
- [ ] SDKs that require CDN loading (azure-maps-control, @googlemaps/js-api-loader)
- [ ] SDKs known to use eval internally (knockout, angular 1.x)

**`server.ts`** — look for:
- [ ] `_meta.ui.csp.connectDomains` — declared but VS Code ignores these
- [ ] Missing `RESOURCE_MIME_TYPE` on resource registration
- [ ] Tools without text content fallback for non-UI hosts

### Step 2: Classify Each Finding

| Finding | Category | Severity |
|---|---|---|
| External `<script src>` | [CDN] | Breaking in VS Code |
| External `fetch()` from UI | [NETWORK] | Breaking in VS Code |
| `eval()` / `new Function()` | [CSP] | Breaking in VS Code |
| `getUserMedia` / geolocation | [PERMISSION] | Breaking in VS Code |
| Library uses eval internally | [RENDERING] | Breaking in VS Code |
| No text fallback in tool result | [PROTOCOL] | Degraded in non-UI hosts |
| CSP relaxation in `_meta` | [CSP] | Cosmetic (VS Code ignores it) |

### Step 3: Apply Rewrite Patterns

## Rewrite Patterns

### Pattern A: CDN Script → npm Bundle

**Before** (broken in VS Code):
```html
<!-- mcp-app.html -->
<script src="https://atlas.microsoft.com/sdk/javascript/mapcontrol/3/atlas.min.js"></script>
```

**After** (works everywhere):
```bash
npm install leaflet  # or the npm-bundleable alternative
```
```typescript
// src/mcp-app.ts
import L from "leaflet";
```
```typescript
// vite.config.ts — vite-plugin-singlefile bundles everything into one HTML
```

**Key**: the library must be fully functional when npm-installed. SDKs that fetch assets from vendor CDNs at runtime (tiles, fonts, sprites) cannot be fixed this way — find an alternative SDK.

### Pattern B: External Fetch → Server Proxy

**Before** (broken in VS Code):
```typescript
// src/mcp-app.ts
const data = await fetch("https://api.example.com/search?q=" + query);
```

**After** (works everywhere):
```typescript
// server.ts — add app-only tool
registerAppTool(server, "search", {
  inputSchema: { query: z.string() },
  _meta: { ui: { resourceUri, visibility: ["app"] } },
}, async ({ query }) => {
  const resp = await fetch(`https://api.example.com/search?q=${encodeURIComponent(query)}`);
  return { content: [{ type: "text", text: JSON.stringify(await resp.json()) }] };
});

// src/mcp-app.ts
const result = await app.callServerTool({ name: "search", arguments: { query } });
```

### Pattern C: eval/new Function → Data-Driven Rendering

**Before** (broken in VS Code):
```typescript
// Model sends code string
app.ontoolinput = (params) => {
  const fn = new Function("scene", "camera", params.code);
  fn(scene, camera);
};
```

**After** (works everywhere):
```typescript
// Define structured input schema
inputSchema: {
  chart: z.object({
    type: z.enum(["bar", "pie", "scatter"]),
    data: z.array(z.object({ name: z.string(), value: z.number() })),
  }),
}

// Pre-built renderers
const RENDERERS = { bar: renderBarChart, pie: renderPieChart, scatter: renderScatter };

app.ontoolinput = (params) => {
  const renderer = RENDERERS[params.chart.type];
  renderer(canvas, params.chart.data);
};
```

### Pattern D: Permission API → Fallback UI

**Before** (broken in VS Code):
```typescript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
startTranscription(stream);
```

**After** (works everywhere):
```typescript
const caps = app.getHostCapabilities();
if (caps?.sandbox?.permissions?.microphone) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startTranscription(stream);
  } catch {
    showTextInput();
  }
} else {
  showTextInput(); // Fallback for VS Code
}
```

### Pattern E: Third-Party Library Eval → Disable Features

**Before** (CesiumJS with Knockout widgets — breaks in VS Code):
```typescript
const viewer = new Cesium.Viewer("cesiumContainer");
```

**After** (disable Knockout-dependent widgets):
```typescript
const viewer = new Cesium.Viewer("cesiumContainer", {
  selectionIndicator: false,  // Knockout → new Function() → CSP violation
  infoBox: false,             // Knockout → new Function() → CSP violation
  geocoder: false,            // Ion-dependent + Knockout
});
```

## SDK Compatibility Reference

| SDK | VS Code | Issue | Alternative |
|---|---|---|---|
| Azure Maps SDK | **No** | CDN + runtime tile fetch | Leaflet + OSM |
| Google Maps JS API | **No** | CDN + API key in URL | Leaflet + OSM |
| Mapbox GL JS | **No** | Workers + eval | Leaflet + OSM |
| CesiumJS (full) | **Partial** | Knockout widgets | Disable infoBox/selectionIndicator |
| Knockout.js | **No** | new Function() for bindings | Lit, Preact, vanilla |
| Angular 1.x | **No** | eval-based templates | Modern Angular, React, vanilla |
| Leaflet | **Yes** | — | — |
| Three.js | **Yes** | Data-driven only | — |
| Chart.js | **Yes** | — | — |
| D3 | **Yes** | — | — |
| Lit | **Yes** | — | — |
| Preact | **Yes** | — | — |
| Solid | **Yes** | — | — |

## Output

After audit, produce:
1. **Compatibility report**: red/yellow/green per finding
2. **Rewrite plan**: specific patterns to apply for each red finding
3. **Host support declaration**: which hosts the app can target after rewrites
4. **HIT entry**: if a new constraint was discovered, record via HIT process

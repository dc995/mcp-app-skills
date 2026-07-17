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
- [ ] SDKs whose canonical install is a CDN `<script>` tag (hosted map/geo SDKs, vendor visualization SDKs) — they won't load under CSP, and many also fetch assets from vendor domains at runtime
- [ ] Libraries known to compile strings to code internally (MVVM/data-binding or eval-based template engines)

**`server.ts`** — look for:
- [ ] `_meta.ui.csp.connectDomains` — declared but VS Code ignores these
- [ ] Missing `RESOURCE_MIME_TYPE` on resource registration
- [ ] Tools without text content fallback for non-UI hosts
- [ ] `server.server.createMessage(...)` / `elicitInput(...)` / `resources/subscribe` **while** `main.ts` uses a stateless transport (`sessionIdGenerator: undefined`) — these server→client requests time out (`-32001`). Needs the stateful transport + a Display-Frame fallback. See `mcp-app-build/sampling.md`.

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
| Sampling/elicitation on stateless transport | [TRANSPORT] | Breaking — server→client request times out (-32001) |

### Step 3: Apply Rewrite Patterns

## Rewrite Patterns

### Pattern A: CDN Script → npm Bundle

**Before** (broken in VS Code):
```html
<!-- mcp-app.html -->
<script src="https://cdn.vendor.example/sdk/v3/sdk.min.js"></script>
```

**After** (works everywhere):
```bash
npm install the-library  # an npm-bundleable equivalent
```
```typescript
// src/mcp-app.ts
import { thing } from "the-library";
```
```typescript
// vite.config.ts — vite-plugin-singlefile bundles everything into one HTML
```

**Key**: the library must be fully functional when npm-installed. SDKs that fetch assets from vendor domains at runtime (map tiles, fonts, sprites, style JSON) cannot be fixed this way — find an alternative SDK or route those fetches through the server.

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

Reason about the **mechanism**, not the brand. Classify any library by how it
loads and renders, then apply the matching verdict.

| Library mechanism | VS Code | Issue | Fix |
|---|---|---|---|
| Loads from a vendor CDN `<script>` + fetches assets (tiles/fonts/styles) from vendor domains at runtime | **No** | CDN script + runtime `connect-src` both blocked | Use an npm-bundleable equivalent, or proxy runtime fetches through the server |
| GL/worker renderer that compiles styles/shaders via eval or blob-eval workers | **No** | eval blocked under CSP | Use a non-eval renderer |
| MVVM/data-binding lib that compiles binding strings via `new Function()` | **No** | string-to-code blocked | Lit, Preact, or vanilla |
| Framework with eval-based template compilation | **No** | string-to-code blocked | A precompiled/AOT framework, React, or vanilla |
| Large engine that bundles eval-using widgets but has a non-eval core | **Partial** | Only the widgets violate CSP | Disable the eval-using widgets (see Pattern E) |
| npm-bundleable renderer using canvas/WebGL/SVG, no runtime vendor fetch | **Yes** | — | — |
| Map/charting lib whose tiles/images load as `<img>` and that bundles cleanly | **Yes** | `img-src` is permissive | — |
| Data-driven 3D / charting (structured input → pre-built renderer) | **Yes** | No eval | — |
| Web-component / view libs that template without eval | **Yes** | — | — |
| Preact | **Yes** | — | — |
| Solid | **Yes** | — | — |

## Output

After audit, produce:
1. **Compatibility report**: red/yellow/green per finding
2. **Rewrite plan**: specific patterns to apply for each red finding
3. **Host support declaration**: which hosts the app can target after rewrites
4. **HIT entry**: if a new constraint was discovered, record via HIT process

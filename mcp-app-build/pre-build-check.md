# Pre-Build Safety Check

**Run this BEFORE scaffolding any new MCP App.** It prevents you from building features that will fail in your target host.

## Step 1: Identify Target Hosts

Ask: "Which hosts will this app run in?"

- **VS Code only** → strictest constraints apply
- **AppHub only** → nearly unrestricted
- **Multi-host** (VS Code + AppHub + others) → must use Universal Safe Set
- **Unknown** → assume multi-host (safest default)

## Step 2: Feature Scan

For each planned feature, check against the host matrix:

### Dynamic Code Execution

| Feature | VS Code | AppHub | Standalone |
|---|---|---|---|
| `eval()` | **BLOCKED** | OK | OK |
| `new Function()` | **BLOCKED** | OK | OK |
| `setTimeout("string")` | **BLOCKED** | OK | OK |

**If your app needs dynamic code execution:**
→ Use **data-driven rendering** instead. Define structured input schemas (chart type, data arrays, styling fields) and pre-build all renderers at compile time.

### External Dependencies

| Feature | VS Code | AppHub | Standalone |
|---|---|---|---|
| `<script src="https://cdn...">` | **BLOCKED** | OK | OK |
| `<link href="https://cdn...">` | **BLOCKED** | OK | OK |
| npm-bundled + vite-singlefile | OK | OK | OK |

**If your SDK requires CDN loading (Azure Maps, Google Maps, Mapbox GL):**
→ **Cannot work in VS Code.** Either: (a) find an npm-bundleable alternative (e.g., Leaflet instead of Azure Maps), or (b) accept VS Code incompatibility and document it.

### External Network Access from UI

| Feature | VS Code | AppHub | Standalone |
|---|---|---|---|
| `fetch("https://external-api.com")` | **BLOCKED** | OK | OK |
| `fetch` to localhost MCP server | OK | OK | OK |
| `app.callServerTool()` | OK | OK | OK |

**If your UI needs external data:**
→ Proxy through the MCP server. Server.ts makes the fetch, returns data as tool result. UI calls `app.callServerTool()`.

### Browser Permission APIs

| Feature | VS Code | AppHub | Standalone |
|---|---|---|---|
| Microphone (`getUserMedia`) | **BLOCKED** | OK | OK |
| Camera (`getUserMedia`) | **BLOCKED** | OK | OK |
| Geolocation | **BLOCKED** | OK | OK |
| Clipboard write | Varies | OK | OK |
| Web Speech API | **BLOCKED** | OK | OK |

**If your app needs permissions:**
→ Check `HostCapabilities.sandbox.permissions` at runtime. Provide fallback UI (text input instead of mic, manual coords instead of geolocation, file upload instead of camera).

### Secure Context APIs

| Feature | Requires HTTPS | VS Code | AppHub (TLS) | Standalone (HTTP) |
|---|---|---|---|---|
| Translation API | Yes | N/A (no iframe grant) | OK | **BLOCKED** |
| Web Bluetooth | Yes | **BLOCKED** | OK | **BLOCKED** |
| SubtleCrypto | Yes | OK (webview is secure) | OK | **BLOCKED** |
| Web Share | Yes | **BLOCKED** | OK | **BLOCKED** |

**If your app needs secure-context APIs:**
→ Proxy through server, or accept host-specific limitations.

## Step 3: Evaluate Result

```
All GREEN  → Proceed with scaffolding
Any YELLOW → Proceed with documented fallbacks
Any RED    → STOP — discuss alternatives with user before building
```

### Decision Tree

```
Needs eval/new Function?
  └─ YES → Use data-driven pattern. Pre-build renderers.

Needs external CDN script?
  └─ YES → Can the library be npm-installed and bundled?
       └─ YES → npm install + vite bundle
       └─ NO  → Find alternative library OR accept VS Code incompatibility

Needs external fetch from UI?
  └─ YES → Proxy through server.ts

Needs browser permission (mic/camera/geo)?
  └─ YES → Build fallback UI + runtime HostCapabilities check

Everything bundleable + data-driven + server-proxied?
  └─ YES → ✅ Safe for all hosts
```

## Step 4: Record Decision

If you determined the app has host limitations:
1. Document in the app's README which hosts it supports
2. Add `test.fail()` annotations for hosts where features are expected to break
3. If a new constraint was discovered, follow the HIT process (`mcp-app-hosts/hit-process.md`)

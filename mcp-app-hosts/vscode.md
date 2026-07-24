# VS Code Host — MCP App Constraints

VS Code Insiders renders MCP App UIs in a heavily sandboxed iframe with the most restrictive CSP of any MCP host.

## CSP Policy

```
script-src 'self' 'unsafe-inline'
connect-src 'self'
media-src 'self'        (external audio/video URLs blocked)
```

- `unsafe-eval` is **NOT** allowed
- `unsafe-inline` IS allowed (inline `<script>` tags work)
- External `<script src="https://...">` is **BLOCKED**
- External `<link href="https://...">` for CSS is **BLOCKED**
- External `<audio>` / `<video>` `src` (and `fetch` of media) is **BLOCKED** (`media-src`/`connect-src 'self'`)
- The iframe is `sandbox="allow-scripts allow-same-origin"` with **no** `allow=` for `autoplay`/`microphone`/`camera`, and **no** Permissions-Policy opt-in

> This policy is **host-controlled and immutable** — no setting, flag, or trust prompt lets the
> app widen it. The ext-apps spec defines opt-in knobs (`_meta.ui.csp.connectDomains` /
> `resourceDomains`, `HostCapabilities.sandbox.permissions`), but **VS Code does not honor them today**:
> the declared domains are ignored and `sandbox.permissions` is not populated, so there is no runtime
> capability to detect and no permission path to request. Design as if the UI is fully isolated and the
> **server is the only egress**.

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

### 7. Media Playback (audio / video / TTS)
- External `<video src="https://...">` / `<audio src="https://...">` → won't load (`media-src`/`connect-src 'self'`)
- `mediaElement.play()` → **auto-blocked**: the sandboxed iframe is granted no `autoplay` permission, so playback (even of allowed sources) is suppressed until a user gesture, and often outright denied
- `window.speechSynthesis` (Web Speech TTS) and `getUserMedia` audio output paths → not granted
- Declaring `_meta.ui.permissions` or `_meta.ui.csp` does **not** change any of this
- **Workaround**: proxy the media through the MCP server and return **bytes**, not a URL — see "Media → server-proxied bytes" below

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

## Inline Height and Fullscreen Work Surfaces

VS Code can cap the height of inline MCP App tiles even when the app's default
`autoResize` sends correct `ui/notifications/size-changed` measurements. The
result is an inner scrollbar around an otherwise healthy app. Treat auto-resize
as advisory host input, not control over the chat layout.

For a large editor, canvas, or studio:

- advertise `availableDisplayModes: ["inline", "fullscreen"]` from the app;
- inspect host context after `await app.connect()`;
- call `requestDisplayMode({ mode: "fullscreen" })` only when VS Code lists it;
- provide a visible control to return to inline mode;
- retain responsive inline layout and `sendSizeChanged` fallback.

Increasing only CSS `min-height` makes the document taller but does not guarantee
that VS Code enlarges the containing tile. Validate both inline scrolling and the
fullscreen path in the actual host.

## Endpoint configuration

VS Code supports configured HTTP and HTTPS MCP endpoints. TLS and port layout are
environment choices, not MCP Apps requirements. Loopback HTTP is suitable for
many local development setups; remote endpoints should use HTTPS and
authentication.
## Registering & Managing the Server in VS Code

### `mcp.json` shape
Two locations: workspace `.vscode/mcp.json` (commit it to share with the team) or the user
profile (`MCP: Open User Configuration`). MCP Apps in this workspace use the HTTP transport on the
TLS port:
```jsonc
{
  "servers": {
    "example": { "type": "http", "url": "http://127.0.0.1:3000/mcp" }
  }
}
```
Other ways to add a server: Extensions view → search `@mcp` (gallery install, user or
"Install in Workspace"); or `MCP: Add Server` for a guided flow. Avoid hardcoding
secrets. Prefer integrated identity, an OS credential store, managed identity or
a vault reference resolved by the server at execution time.

### Trust
On first start VS Code shows a **trust dialog**; the server won't run (its tools, prompts,
resources, **and MCP Apps** are excluded) until trusted. Starting the server directly from the
`mcp.json` code lens **skips** the prompt. Reset with `MCP: Reset Trust`.

### Manage / troubleshoot
- `MCP: List Servers` → pick a server → **Restart** / **Show Output** / Enable / Disable.
- The **Show Output** log is the first stop when a tool errors or the server won't load.
- Enable/disable state is stored separately from `mcp.json`, so it doesn't affect the shared file.

### Sandboxing (not relevant to MCP App UI isolation)
`"sandboxEnabled": true` (+ a top-level `sandbox` object) restricts a **stdio server process's**
filesystem/network — **macOS/Linux only, not Windows**, and unrelated to the *iframe* CSP/sandbox
that governs the App UI documented above. Don't conflate the two.
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

### Media (audio / video) → host-mediated or validated local resource
`media-src 'self'` blocks external media URLs and there is no `autoplay` grant, so a
media app cannot point an element at a remote URL. Fetching on the server avoids
UI network egress, but `data:`/`blob:` playback still depends on the host's actual
`media-src` policy. Do not claim that inline bytes automatically satisfy `'self'`.

Preferred options:

1. Host-mediated playback.
2. A host-rehosted same-origin media URL.
3. Small inline bytes only after a host-specific probe confirms the scheme.

```typescript
// UI: ask the server/host for an approved media resource, never fetch an
// arbitrary external URL directly.
const res = await app.callServerTool({ name: "fetch-media", arguments: { url } });
const mediaUrl = (res._meta as { mediaUrl?: string })?.mediaUrl;
if (mediaUrl) vid.src = mediaUrl;
// Playback still needs a user gesture (no autoplay) — wire play() to a click, not onload.
```

The server must allowlist destinations, block private/metadata addresses,
revalidate redirects, enforce timeout/content-type/size limits, and return a
host-approved resource reference. See `mcp-app-security/server-security.md`.

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
   - `GET /auth/callback` → validates single-use `state`, exchanges the code with
     the matching PKCE verifier, stores tokens
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
   surface via the tool result `_meta`. Credentials are resolved from an integrated
   identity, credential store or vault reference, never hardcoded.

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
3. **Endpoint must match `mcp.json`.** Confirm the configured scheme, address,
   port and path exactly match the listening server.

## Runtime Host Detection

```typescript
const app = new App({ name: "My App", version: "1.0.0" });
await app.connect();
const caps = app.getHostCapabilities();

// Do not probe CSP with eval/new Function. Use declared capabilities and retain
// the structured-data/server-proxy fallback.

// Check permissions
if (!caps?.sandbox?.permissions?.microphone) {
  showFallbackUI("Microphone not available in this host");
}
```

## Canonical References

- VS Code — Add and manage MCP servers: https://code.visualstudio.com/docs/agent-customization/mcp-servers
- VS Code — MCP configuration reference: https://code.visualstudio.com/docs/agents/reference/mcp-configuration
- VS Code — MCP Apps support (blog): https://code.visualstudio.com/blogs/2026/01/26/mcp-apps-support
- ext-apps — Testing MCP Apps: https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/testing-mcp-apps.md

> Media CSP/sandbox constraints above are empirical observations from June 2026,
> recorded in `evidence/vscode-2026-06.md`. Revalidate on host/runtime updates.

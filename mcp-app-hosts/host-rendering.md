---
name: host-rendering
description: Rendering MCP App UI tiles in a custom web / React host — the iframe bridge, sandbox flags, CSP, theming, the tool-result-to-tile pipeline, and the sampling reverse-channel for tiles that borrow the host model.
---

# Rendering MCP App Tiles in a Web / React Host

Host-authoring reference for the **rendering side** of a custom MCP App host: how a
tool result becomes an interactive UI tile in a web app (React or otherwise). The
SDK/agent side (wiring servers into a session, capturing tool calls) is covered
elsewhere; this file is about everything that happens *after* a tool returns —
reading its UI resource, mounting it in a sandboxed iframe, wiring the postMessage
bridge, theming it, and the failure modes a browser imposes.

Every lesson here was found by building a host and watching real apps render (or
fail to) in a real browser. They are framework-agnostic; React is used for
illustration because most hosts are SPAs.

## 1. The tile pipeline (end to end)

```
tool result  ──▶  read _meta.ui.resourceUri  ──▶  resources/read (MCP Client)
     │                                                     │
     │                                              UI HTML (single file)
     ▼                                                     ▼
 structured result for the model            <iframe srcdoc=HTML sandbox=…>
                                                           │
                                       postMessage handshake (ui/initialize …)
                                                           │
                              host →  tool-input + tool-result  → app renders
```

Two channels are involved: the **agent/session** surfaces the tool call + result,
and a separate **MCP `Client`** reads the `ui://` resource (the agent session
typically does *not* expose `resources/read`). The tile is an **iframe whose
`srcdoc` is the app's bundled HTML**, driven by a JSON-RPC postMessage bridge.

## 2. Read the UI resource URI from BOTH `_meta` shapes

A tool advertises its UI resource in `_meta`, and it appears in **two different
shapes** depending on how the server registered the tool. A host must read both or
it will silently render no tile for half of all apps:

```ts
// Official flat key (exported as RESOURCE_URI_META_KEY by the apps SDK)
const FLAT = "ui/resourceUri";

function readUiResourceUri(meta: Record<string, unknown> | undefined): string | undefined {
  if (!meta) return undefined;
  // 1) flat: _meta["ui/resourceUri"]  — set by raw server.registerTool(...)
  const flat = meta[FLAT];
  if (typeof flat === "string") return flat;
  // 2) nested: _meta.ui.resourceUri   — set by the higher-level registerAppTool(...)
  const ui = meta.ui as { resourceUri?: unknown } | undefined;
  if (ui && typeof ui.resourceUri === "string") return ui.resourceUri;
  return undefined;
}
```

- Helpers like `registerAppTool` normalize **both** keys; an app authored with the
  raw `server.registerTool` sets **only the flat** `ui/resourceUri`. Read both.
- The same dual-shape rule applies anywhere you inspect `_meta` for UI hints
  (e.g. a per-resource CSP). Don't hard-code one path.

## 3. iframe sandbox flags — the difference between "renders" and "is interactive"

A tile mounted with only `sandbox="allow-scripts"` will **display** but silently
lose interactivity that depends on pointer capture or popups — drag-to-orbit
(Three.js `OrbitControls`), drag sliders, color pickers, and OAuth `window.open`
all break with no console error.

```html
<!-- Minimum set for an interactive tile -->
<iframe
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
  srcdoc="…">
</iframe>
```

| Flag | Why a tile needs it |
|---|---|
| `allow-scripts` | run the app at all |
| `allow-same-origin` | **`setPointerCapture`**, canvas pointer events, `localStorage`, workers — drag/orbit dies without it |
| `allow-popups` + `allow-popups-to-escape-sandbox` | `window.open` for sign-in / "open in new tab" flows |

> Security note: `allow-scripts` + `allow-same-origin` together let the framed
> document reach its own origin. Keep tiles on a **srcdoc / `about:srcdoc`** origin
> (not your app's real origin) and rely on **CSP** (next section) for isolation,
> rather than withholding `allow-same-origin` and breaking every interactive app.

## 4. CSP for the tile frame — and honoring a per-resource opt-in

Set a Content-Security-Policy on the framed document (via a `<meta http-equiv>`
injected into the `srcdoc`, or a header if you serve the resource). A workable
baseline that still allows inline app code:

```
default-src 'none';
script-src 'unsafe-inline';        /* most apps inline their bundle; no 'unsafe-eval' */
style-src  'unsafe-inline';
img-src    data: blob:;
font-src   data:;
connect-src 'none';                /* widen only per app, see below */
frame-src  data: blob:;            /* needed if the app embeds its own frames */
```

- Some apps declare a needed relaxation in `_meta` (e.g. an extra `connect-src` or
  `frame-src`). Read it and **extend** the CSP for that one resource rather than
  loosening the global policy.
- Avoid `'unsafe-eval'`. Apps that need `eval`/`new Function()` (some charting and
  3D widget libraries use them internally) should be flagged in audit, not enabled
  host-wide.

## 5. Plugin-rendered content (PDF) is ALWAYS blocked in a sandboxed iframe

A `data:application/pdf` (or any browser-*plugin*-rendered type) **will not render
inside a sandboxed iframe** in Chromium/Edge — regardless of URL scheme
(`data:`, `blob:`, `https:`). The browser blocks the internal PDF viewer in any
sandboxed frame. This is not fixable with CSP or sandbox flags. Two host-side
escapes:

1. **Unsandboxed frame (desktop/Electron-style host).** If your host is a desktop
   shell you control, render plugin content in a frame *without* the `sandbox`
   attribute — it displays inline. Only do this for content you trust.
2. **Re-host + open top-level (browser host).** Persist the bytes to a
   **same-origin** URL (`/blob/<id>`) and surface a card/button that opens it
   **top-level** (`target="_blank"`, not inside the sandboxed tile). The viewer
   loads in a real tab where the plugin is allowed.

```ts
// Re-host a framed data: payload the browser would block, return a same-origin URL
function rehostBlockedDataUrl(dataUrl: string, store: BlobStore): string {
  const { mime, bytes } = parseDataUrl(dataUrl);   // e.g. application/pdf
  const id = store.put(bytes, mime);
  return `/blob/${id}`;                              // open this top-level, not in the tile
}
```

## 6. Theme the tile from the host (dark/light) — two places, not one

Most apps render **transparent** and inherit color from the host via CSS custom
properties they reference but never define. To theme them you must do **both**:

**(a) Inject host variables + `color-scheme` into the app document** (`srcdoc`):

```ts
function prepareSrcdoc(appHtml: string, mode: "dark" | "light"): string {
  const vars = hostStyleVariables(mode);   // { "--color-background-primary": "#1b1a19", … }
  const styleTag =
    `<style>:root{color-scheme:${mode};` +
    Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";") +
    `}</style>`;
  // inject right after <head> (or prepend) so the app's own CSS can override
  return appHtml.replace(/<head[^>]*>/i, (m) => m + styleTag);
}
```

Pass the same values in the **`hostContext.styles.variables`** handshake payload so
apps that call `useHostStyles()` get them programmatically too. Use the documented
key names (`--color-background-primary`, `--color-text-secondary`, `--font-sans`,
…) — apps key off those exact names.

**(b) Theme the iframe ELEMENT's own background.** This is the one everyone misses:
because apps are transparent, the **iframe element's default `background:white`
shows through in dark mode** as a white box around your themed content. Set it:

```tsx
<iframe
  style={{ background: hostStyleVariables(mode)["--color-background-primary"] }}
  /* …sandbox, srcdoc… */
/>
```

Symptom if you forget (b): the app content is dark/correct but sits on a white
rectangle. It's the iframe element, not the app.

## 7. Host chrome: OS-aware dark/light, done accessibly

For the host's own UI (nav, pickers, panels), drive theme from the OS and meet
contrast requirements — don't hand-pick greys:

```ts
// React: follow prefers-color-scheme, re-render on change
function useColorScheme(): "dark" | "light" {
  const get = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const [scheme, set] = useState(get);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => set(get());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return scheme;
}
```

- Mount a **single root theme provider** (e.g. a design-system `FluentProvider`/
  theme context) at the app root; tokenize every surface (`var(--token)`), no
  literal hex in components. A missing root provider is the usual cause of an
  "unreadable top menu" in one mode.
- Mirror the same `prefers-color-scheme` switch in any **static** host pages
  (a plain `@media (prefers-color-scheme: dark)` block) so they match the SPA.

## 8. Built-in tool calls interleave — keep each result with its own tile

When the agent runs several tools (and any host/built-in tools), the pre/post
tool-use hooks **do not arrive 1:1**: a built-in (e.g. an "intent" logger) can fire
its post-hook *between* another tool's pre and post. A host that attaches "the most
recent result to the most recent call" will **cross-wire** results — a visual tile
shows another tool's text, or vice-versa.

Correlate each result to its call by **tool identity** (a pending-call queue keyed
by name), not by position; and resolve **failed** calls explicitly (the post-hook
fires only on success, so a failure left pending will absorb a later tool's
result):

```ts
const pending: ToolCall[] = [];
onPreToolUse  = (c) => pending.push({ name: strip(c.toolName), args: c.toolArgs });
onPostToolUse = (c) => {
  const call = matchPendingByName(pending, strip(c.toolName));  // NOT pending.at(-1)
  if (call) call.result = normalize(c.toolResult);
};
onPostToolUseFailure = (c) => {
  const call = matchPendingByName(pending, strip(c.toolName));
  if (call) { call.ok = false; call.result = normalize(c.error); }  // free it
};
```

(Strip the `<serverId>-` namespace prefix before matching against your UI map.)

## 9. Don't trust the model to relay an opaque handle between two tools

A common composite pattern is: **tool A returns a handle** (a file path, an id, a
URL) and the model must **pass it into tool B**. Models frequently **garble or
hallucinate** that handle — inventing a different UUID, dropping a path segment —
so tool B fails (`ENOENT`, not-found) and the tile errors with something like
"result did not include rendered content." Your headless test may pass by luck;
interactively it breaks.

Make the relay **robust at the host**, not dependent on the model echoing a long
opaque string. If your SDK exposes a pre-tool-use hook with an args-override
(`modifiedArgs`), repair the call before it executes:

```ts
// Host records what tool A actually produced…
let lastHandle: string | undefined;
toolA.handler = async (a) => { const out = await run(a); lastHandle = out.path; return out; };

// …and repairs tool B's args if the model's handle is broken.
onPreToolUse = (toolName, args) => {
  if (toolName !== "render-doc") return;                 // only the consumer tool
  if (!lastHandle || !exists(lastHandle)) return;        // nothing to repair with
  const got = (args as { path?: string }).path;
  if (got && exists(got) && inSandbox(got)) return;      // model got it right → leave it
  return { modifiedArgs: { ...args, path: lastHandle } }; // garbled/missing → repoint
};
```

Rules that keep this safe and surprise-free:
- Only intervene for the **consumer** tool, only when you have a **valid** recorded
  handle, and only when the supplied one is **missing/broken/out-of-sandbox**.
- Never overwrite a correct, existing in-sandbox value.
- Still instruct the model (in the skill/prompt) to copy the handle **verbatim** —
  the rewrite is a safety net, not a license to be sloppy.

This generalizes: any "compose then render", "create then open", "upload then
embed" flow should treat the handle relay as host-repairable, because an opaque
token round-tripped through a language model is inherently fragile.

## 10. Other rendering gotchas

- **Bridge timing.** Do not send `tool-input` / `tool-result` before the app sends
  its **`ui/notifications/initialized`** — that notification is the render-ready
  signal. Sending early is dropped silently and the tile stays blank.
- **Handshake field name.** The initialize response uses **`hostCapabilities`**,
  not `capabilities`; the apps SDK validates with a schema and a wrong name fails
  silently.
- **Normalize results before the bridge.** Tool results arrive in several shapes
  (`{ contents }`, `{ content: string }`, bare string); the bridge expects
  `{ content: [{ type, text }] }`. Normalize, or tiles render empty/garbled.
- **Re-render on resume.** When you resume a prior session, the previous turns'
  tiles are gone from the live DOM; re-hydrate them from the persisted tool-call
  record, not from the agent reply (which carries no tool calls).
- **Self-signed dev TLS.** When the host (HTTPS) reads `ui://` resources from
  downstream servers on self-signed certs, set
  `NODE_TLS_REJECT_UNAUTHORIZED = "0"` **before** importing the fetch client —
  dev only, never ship it.

## 11. Interactive tiles that borrow the host model (sampling)

Some tiles do more than render — they ask the **host's model** to do work (a hint
generator, a "summarize this" button, an autocompleter). The app's button calls a
server tool, and that tool issues `sampling/createMessage` **back to the host** —
the server→host→model reverse channel. As a host you must *fulfil* it, or the app
falls back to its degraded path (e.g. "the host declined to generate a hint").

Two steps, and **both are required** — this is the trap:

1. **Declare the capability** on the MCP client that talks to the server:
   `new Client(info, { capabilities: { sampling: {} } })`.
2. **Register a handler** for it:
   `client.setRequestHandler(CreateMessageRequestSchema, handler)` — the handler
   flattens `params.messages` + `params.systemPrompt`, runs your model, and returns
   `{ role:"assistant", content:{ type:"text", text }, model }`.

> **Gotcha: declaring the capability WITHOUT registering the handler = silent
> decline.** The server's `createMessage` fails and the app shows its fallback,
> with no error surfaced in the host. Register the handler **before** `connect()`
> so a request arriving mid-`tools/call` is answered.

Routing matters: the sampling request returns over **whichever client carried the
UI's `tools/call`**. If your host proxies tile tool calls on a per-call client,
that per-call client is the one that needs the handler — not (only) the long-lived
agent session. Thread the model-fulfiller down to where you build the proxy
client. The downstream server also needs a **stateful transport** (a negotiated
session id) for the reverse request to resolve.

## Quick triage

| Symptom | Likely cause | Fix |
|---|---|---|
| No tile for some apps, others fine | Only read one `_meta` shape | Read both `ui/resourceUri` and `ui.resourceUri` (§2) |
| Tile renders but won't drag/orbit | `sandbox="allow-scripts"` only | Add `allow-same-origin allow-popups …` (§3) |
| Dark content sits on a white box | iframe element default bg | Set iframe `style.background` to the theme bg (§6b) |
| App ignores host theme | Vars not injected into `srcdoc` + not in `hostContext` | Do both (§6a) |
| PDF won't show in the tile | Plugin content blocked in sandboxed frame | Unsandbox (desktop) or re-host + open top-level (§5) |
| Wrong text appears in a tile | Positional result correlation | Correlate by tool identity (§8) |
| 2nd tool fails on a path/id from the 1st | Model garbled the relayed handle | Host-side `modifiedArgs` repair (§9) |
| Tile blank despite a tool call | Sent input before `initialized`, or wrong handshake field | Wait for `initialized`; use `hostCapabilities` (§10) |
| App says "host declined" on a hint / AI button | Sampling capability declared but no `CreateMessageRequestSchema` handler (or it's on the wrong client) | Register the handler before connect, on the client carrying the tile's `tools/call` (§11) |
| Top menu unreadable in one mode | No root theme provider / literal colors | Root provider + tokens + OS scheme hook (§7) |

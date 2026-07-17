# Authoring an MCP App Host on the GitHub Copilot SDK

Host-authoring reference for custom MCP App hosts built on the **GitHub Copilot SDK**
(`@github/copilot-sdk`) — e.g. **CopilotHub** (`CopilotHubMCPapp/`) and **DeepSpaceMind / DSM**.
These hosts feed MCP servers into `client.createSession({ mcpServers, … })` and let the
Copilot agentic loop plan and call the tools, instead of orchestrating an LLM directly.

Reference implementation: `CopilotHubMCPapp/` — `agent.ts` (SDK session), `mcp-proxy.ts`
(Client proxy), `main.ts` (Express + REST), `mcp-registry.ts`, `shared-state.ts`. Contrast with
[apphub.md](apphub.md), which orchestrates its own LLM and never uses the Copilot SDK.

## Dual-Channel Architecture

A Copilot-SDK host runs **two independent MCP channels** — the SDK does *not* replace the
MCP `Client`, because the SDK session exposes tool calls but **not** `resources/read`:

```
CopilotHost (Express, TLS)
 ├── Channel 1 — Copilot SDK session   (agent.ts)
 │     client.createSession({ mcpServers, tools, hooks })
 │     → tool DISCOVERY, PLANNING, CALLING by the Copilot agent
 │
 └── Channel 2 — MCP Client proxy      (mcp-proxy.ts, @modelcontextprotocol/sdk)
       persistent Client per downstream server
       → resources/read (App HTML for iframes), splash pre-renders,
         server status/health, AND the sampling reverse-channel (see below)
```

Rule: route **agent tool execution** through the SDK session; route **resource reads,
splash, status, and server→host sampling** through the Client proxy. You need both.

## Client & Session Lifecycle

```ts
import { CopilotClient, approveAll, defineTool } from "@github/copilot-sdk";

const client = new CopilotClient({ logLevel: "warning" });
await client.start();                 // fails gracefully if Copilot CLI isn't authenticated

const session = await client.createSession({
  model: "auto",                       // or an id from client.listModels()
  onPermissionRequest: approveAll,     // host auto-approves; gate yourself if needed
  tools: hubTools,                     // host-injected custom tools (see below)
  mcpServers,                          // buildMcpServersConfig() — see Gotcha 1
  systemMessage: { mode: "replace", content: SYSTEM_PROMPT },
  streaming: false,
  infiniteSessions: { enabled: false },
  hooks: { onPreToolUse, onPostToolUse },   // tool-call capture — see Gotcha 2
});
const reply = await session.sendAndWait({ prompt }, 120_000);  // reply.data.content
await session.disconnect();           // per-request session; client stays up
// on shutdown: await client.stop();
```

- **One session per request** is fine — `createSession` → `sendAndWait` → `disconnect`.
  Keep the `client` alive for the process lifetime.
- If `client.start()` throws (CLI not installed / not `copilot auth login`'d), mark the host
  `not_configured` and degrade — don't crash.

> Both gotchas below were verified by differential debugging: CopilotHub worked, DSM didn't →
> diff the two host adapters field-by-field → the difference was exactly these two things.

## Gotcha 1 — HTTP/SSE MCP servers need an explicit `tools: ["*"]`

When building the `mcpServers` config for `createSession`, **always set a `tools` array** on
each HTTP/SSE server. If you omit it, the Copilot CLI marks the server `not_configured` and
**never loads its tools** — even though the SDK's own type docs claim "`tools` undefined
means all tools."

```ts
// ❌ DSM did this → CLI reports mcp_servers_loaded → status: "not_configured"
{ type: "http", url }

// ✅ CopilotHub did this → status: "connected", agent can call the tools
{ type: "http", url, tools: ["*"] }   // fall back to ["*"] when the spec lists none
```

- **Symptom**: the agent says it has no such tool / the server shows `not_configured` in the
  `mcp_servers_loaded` debug event; tools never appear.
- **Fix**: default HTTP/SSE servers to `tools: ["*"]` in your `buildMcpServersConfig()`
  helper. Only narrow the array when the app spec explicitly lists tool names.
- **Why it bites**: the empirical CLI behavior contradicts the SDK type doc — trust the
  `mcp_servers_loaded` status, not the doc comment.

## Gotcha 2 — Capture tool calls via session hooks, not the reply payload

The GHCP SDK does **not** embed tool calls in the reply payload, so a host that "walks the
reply" to find them gets `[]` (no UI tile, even though the agent really called the tool).
Record calls in the session **hooks** instead:

```ts
const captured: ToolCall[] = [];
await client.createSession({
  mcpServers,
  hooks: {
    onPreToolUse:  (c) => { captured.push(normalize(c)); },   // or onPostToolUse
    onPostToolUse: (c) => { /* attach result */ },
  },
});
// Prefer `captured` over reply-payload walking when building tiles.
```

- **Strip the namespace prefix.** The SDK namespaces MCP tools as `<serverId>-<tool>`
  (e.g. `threejs-show_threejs_scene`). UI maps / `tagUiToolCalls` match on the **bare** tool
  name, so strip the leading `<serverId>-` before lookup.
- **Hook naming**: the GA cookbook uses `onPermissionRequest`; older CopilotHub-style hosts
  use `onPreToolUse` / `onPostToolUse`. Use whichever your SDK version exposes — the point is
  to capture from the hook, not the reply.

## Hub-Injected Custom Tools & Tool Visibility

The host can expose its **own** tools to the agent alongside the MCP server tools, via
`defineTool`, and can **hide** server tools the agent shouldn't call.

```ts
// Host tools (e.g. shared-state access) — handed to createSession({ tools })
const hubTools = [
  defineTool("set-shared-state", {
    description: "[Hub] Merge data into shared state (shown in the State Viewer tile)",
    parameters: { type: "object", properties: { data: { type: "object" } }, required: ["data"] },
    skipPermission: true,                 // host-internal — no approval prompt
    handler: async (args) => setState((args as { data?: object }).data ?? {}),
  }),
];
```

- **Hide UI-only tools from the agent.** Mark them `internalTools` in your registry and exclude
  them when building `mcpServers` (the UI still calls them directly via the Client proxy):
  ```ts
  const excluded = new Set(server.internalTools ?? []);
  const allowed = server.tools.filter((t) => !excluded.has(t));
  config[server.id] = { type: "http", url: server.url, tools: allowed.length ? allowed : ["*"] };
  ```

## Normalizing SDK Tool Results

The SDK returns tool results in several shapes (`{ contents }`, `{ content: string }`,
`{ textResultForLlm }`, or a bare string) but the MCP App bridge expects
`{ content: [{ type, text }] }`. Normalize before handing results to a tile:

```ts
function normalizeToolResult(raw) {
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o?.contents)) return { content: o.contents };       // SDK MCP format
  if (Array.isArray(o?.content)) return raw;                            // already good
  if (typeof o?.content === "string") return { content: [{ type: "text", text: o.content }] };
  if (typeof o?.textResultForLlm === "string") return { content: [{ type: "text", text: o.textResultForLlm }] };
  if (typeof raw === "string") return { content: [{ type: "text", text: raw }] };
  return raw;
}
```

## Sampling Bridge — server → host → model

The headline host-authoring capability: let downstream MCP servers borrow the host's Copilot
model via `sampling/createMessage`. This is the **concrete implementation** of the host/client
side described in [`../mcp-app-build/sampling.md`](../mcp-app-build/sampling.md). It runs on the
**Client proxy** channel, not the SDK session.

```ts
// mcp-proxy.ts — declare the capability and answer the request
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CreateMessageRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const client = new Client({ name: "CopilotHub", version: "1.0.0" },
                          { capabilities: { sampling: {} } });   // REQUIRED to receive requests
client.setRequestHandler(CreateMessageRequestSchema, async (req) => {
  const result = await sampleViaCopilot({ messages: req.params.messages, systemPrompt: req.params.systemPrompt });
  return { role: "assistant", content: { type: "text", text: result.text }, model: result.model };
});
```

```ts
// agent.ts — fulfil the sample with a short-lived Copilot session
export async function sampleViaCopilot(reqz) {
  if (!client) throw new Error("Copilot SDK not configured");   // caller maps to graceful decline
  // Agentic sampling: register any server-offered tools so the model may call them mid-sample.
  const tools = (reqz.tools ?? []).map((t) => defineTool(t.name, {
    description: t.description ?? `Server tool ${t.name}`,
    parameters: t.inputSchema ?? { type: "object", properties: {} },
    skipPermission: true,
    handler: async (args) => ({ acknowledged: true, tool: t.name, args }),
  }));
  const prompt = reqz.messages.map((m) => `${m.role}: ${m.content?.text ?? ""}`).join("\n\n");
  const session = await client.createSession({ model: reqz.model || "auto", onPermissionRequest: approveAll, tools, streaming: false });
  try { return { model: "copilot (auto)", text: (await session.sendAndWait({ prompt }, 60_000))?.data?.content ?? "" }; }
  finally { await session.disconnect(); }
}
```

- The handler is **inert** for Display-Frame apps — it only fires when a server actually issues
  `sampling/createMessage`, so a host can declare `capabilities.sampling` universally.
- The downstream server still needs a **stateful transport** for the reverse channel to resolve
  (see `sampling.md`); the host side here is necessary but not sufficient on its own.

> **Gotcha — declaring `capabilities.sampling` WITHOUT registering the handler = silent decline.**
> The capability advertisement and the `CreateMessageRequestSchema` handler are **two separate
> steps**. A client that declares `{ capabilities: { sampling: {} } }` but never calls
> `setRequestHandler(CreateMessageRequestSchema, …)` will make the server's `createMessage`
> **fail/decline** — the app then shows its graceful-degradation path (e.g. "the host declined to
> generate a hint") with no error in the host. Always do **both**, and register the handler
> **before** `client.connect(...)` so a request that arrives mid-`tools/call` is answered.
>
> **Route it over the right client.** The sampling request returns over **whichever client carried
> the UI's `tools/call`** — i.e. the **Client proxy** connection that proxied the tile's tool
> invocation, not the agent SDK session. If your host proxies UI tool calls on a *per-call*
> connection, that per-call client is the one that must carry the sampler. Thread the fulfiller
> down to wherever you build the proxy client, not only the long-lived agent session.

## Transport Negotiation (Client proxy)

Connect with **Streamable HTTP first, fall back to SSE** for older servers:

```ts
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(entry.url)));
} catch (err) {
  const msg = String(err);
  if (msg.includes("Upgrade Required") || msg.includes("405")) {
    await client.connect(new SSEClientTransport(new URL(entry.url.replace(/\/mcp$/, "/sse"))));
  } else throw err;
}
```

Connect to all servers with `Promise.all` and capture per-server errors so one dead server
doesn't block the host (`status: "connected" | "error" | "disconnected"`).

## TLS & Dev Config

- Host serves **HTTPS only** (CopilotHub: port **4021**); load certs from `.certs/localhost.pem`
  or `MCP_TLS_CERT` / `MCP_TLS_KEY`.
- Downstream servers also use TLS (`https://localhost:<HTTP+1000>/mcp`). For self-signed dev
  certs, set `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` **before** importing anything that
  fetches — dev only, never ship it.

## Host REST Surface (reference)

CopilotHub exposes a small REST API the frontend drives; useful to mirror and to test against:

| Endpoint | Purpose |
|---|---|
| `GET /api/servers`, `POST /api/servers/reconnect` | Status + discovered tools per server |
| `GET /api/tools`, `POST /api/tools/call` | Flattened tool list; direct tool call (UI path) |
| `GET /api/splash`, `POST /api/splash/:serverId` | Pre-render sample UIs (tool result + resource HTML) |
| `GET /api/resource/:serverId?uri=` | Read an MCP App `ui://` resource as HTML for an iframe |
| `GET/POST/PUT/DELETE /api/state` | Shared state (merge / replace / clear) |
| `GET /api/chains` | Sample multi-tool chains + availability |
| `GET /api/models` | `client.listModels()` |
| `POST /api/agent/run`, `GET /api/agent/status` | Run a prompt/chain through the SDK; config status |

## Quick Triage

| Symptom | Cause | Fix |
|---|---|---|
| Server `not_configured`, no tools load | `mcpServers[].tools` omitted | Add `tools: ["*"]` |
| Agent calls tool but no UI tile / `TOOLCALLS: ()` empty | Reading tool calls from reply payload | Capture in `onPreToolUse`/`onPostToolUse` |
| Captured call name doesn't match UI map | SDK namespaced it `<serverId>-<tool>` | Strip the `<serverId>-` prefix |
| Tile renders empty / wrong shape | Raw SDK result not normalized | `normalizeToolResult()` before sending to the tile |
| Server's `createMessage` rejects/hangs | Host client didn't declare `capabilities.sampling` or server is stateless | Declare it + set `CreateMessageRequestSchema` handler; make server transport stateful |
| App shows "host declined" but you DID declare sampling | Capability declared but no `setRequestHandler`, or the handler is on the wrong client (not the one carrying the UI's `tools/call`) | Register the handler (before connect) on the client that proxies the tile's tool calls |
| `resources/read` not available from the agent | SDK session doesn't expose resources | Use the MCP `Client` proxy channel for resource reads |
| Downstream connect fails with 405 / "Upgrade Required" | Server speaks SSE, not Streamable HTTP | Fall back to `SSEClientTransport` on `/sse` |

## Debugging Method That Found These

When "it works on my harness but not here," **diff the two host adapters that both call
`createSession`** rather than guessing. The entire difference here was one field
(`tools`) plus where each host read tool calls from. Read the working host's
`buildMcpServersConfig()` / session wiring and compare field-by-field against the broken one;
confirm each fix against the `mcp_servers_loaded` debug event before moving on.

> Verified 2026-06-12 (DSM vs CopilotHub, `@github/copilot-sdk`, threejs MCP server).
> Both fixes confirmed live: server flipped `not_configured → connected`, and hook-based
> capture restored the tile.

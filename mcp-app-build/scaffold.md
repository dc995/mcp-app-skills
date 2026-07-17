# Scaffold — New MCP App Project

## Dependencies

```bash
# Production
npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/sdk zod express cors

# Dev
npm install -D typescript vite vite-plugin-singlefile concurrently cross-env tsx @types/node @types/express @types/cors
```

Always use `npm install` — never guess version numbers.

## server.ts Template

```typescript
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DIST_DIR = path.join(import.meta.dirname, "dist");

export function createServer(): McpServer {
  const server = new McpServer({
    name: "<App Name> Server",
    version: "1.0.0",
  });

  const resourceUri = "ui://<tool-name>/mcp-app.html";

  registerAppTool(server, "<tool-name>", {
    title: "<Tool Title>",
    description: "<What the tool does>",
    inputSchema: {
      // Use structured data, NOT code strings
      // Example: data: z.array(z.object({ name: z.string(), value: z.number() }))
    },
    _meta: { ui: { resourceUri } },
  }, async (args) => {
    return {
      content: [{ type: "text", text: JSON.stringify(args) }],
    };
  });

  registerAppResource(server, resourceUri, resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
    },
  );

  return server;
}
```

## main.ts Template

```typescript
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import type { Request, Response } from "express";
import { createServer } from "./server.js";

const port = parseInt(process.env.PORT ?? "<YOUR_PORT>", 10);

async function startHTTP() {
  const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts: ["localhost", "127.0.0.1"] });
  app.use(cors());

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    // STATELESS transport: a fresh server+transport per request. Correct for
    // "Display Frame" apps (tool in → UI out). ⚠️ This BREAKS server-initiated
    // requests (sampling/createMessage, elicitation, resource subscriptions):
    // the client's reply arrives on a separate POST that lands on a new
    // transport instance, so the original request never resolves and the tool
    // times out (-32001). If your app calls back into the client, use the
    // STATEFUL template below instead. See sampling.md (Frame Type B).
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(port, () => console.log(`MCP server on http://localhost:${port}/mcp`));
}

async function startStdio() {
  await createServer().connect(new StdioServerTransport());
}

if (process.argv.includes("--stdio")) startStdio();
else startHTTP();
```

## main.ts Template — STATEFUL (Frame Type B: sampling / elicitation / subscriptions)

Use this **only** if your server calls back into the client (sampling,
elicitation, server-driven progress, or resource subscriptions). It keeps a
transport per session keyed by `Mcp-Session-Id` so the client's reply routes
back to the same instance. See [sampling.md](sampling.md) for when this is
required and the matching client-side capability.

```typescript
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
// ...same imports as the stateless template...

const transports = new Map<string, StreamableHTTPServerTransport>();

app.all("/mcp", async (req: Request, res: Response) => {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  let transport = sid ? transports.get(sid) : undefined;

  if (!transport) {
    if (req.method !== "POST" || !isInitializeRequest(req.body)) {
      res.status(400).json({ jsonrpc: "2.0", id: null,
        error: { code: -32000, message: "Bad Request: no valid session ID" } });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => transports.set(id, transport!),
    });
    transport.onclose = () => { if (transport!.sessionId) transports.delete(transport!.sessionId); };
    const server = createServer();
    await server.connect(transport);
  }
  await transport.handleRequest(req, res, req.body);
});
```

> Stateful servers hold per-session memory — always clean up on `onclose`, and
> note they are stickier to scale horizontally (session affinity). Keep stateless
> as the default; opt into this only when a server→client request forces it.

## vite.config.ts

```typescript
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    rollupOptions: { input: process.env.INPUT },
    outDir: "dist",
  },
});
```

## package.json scripts

```json
{
  "scripts": {
    "build": "tsc --noEmit && tsc -p tsconfig.server.json && cross-env INPUT=mcp-app.html vite build",
    "start": "concurrently \"cross-env NODE_ENV=development INPUT=mcp-app.html vite build --watch\" \"tsx watch main.ts\""
  }
}
```

## .vscode/mcp.json Registration

Add to the workspace's `.vscode/mcp.json`:

```json
"<app-id>": {
  "type": "http",
  "url": "https://localhost:<TLS_PORT>/mcp"
}
```

## start-all.ps1 Registration

Add to the `$apps` ordered hashtable in `start-all.ps1`:

```powershell
"<AppName>MCPapp" = <HTTP_PORT>
```

## Ports, TLS & start-all

Two distinct ports per app, by convention:

| | Port | Used by |
|---|---|---|
| HTTP | `3xxx` (e.g. `3013`) | plain dev / `--no-tls` |
| TLS  | **HTTP + 1000** (e.g. `4013`) | what `.vscode/mcp.json` points at |

- **`mcp.json` uses the `https://localhost:<HTTP+1000>/mcp` URL**, so the server
  must run **with TLS** for the host to connect. `start-all.ps1` runs TLS by
  default; certs come from `mkcert` at the repo-root `.certs/` folder
  (e.g. `.certs/localhost.pem` + `.certs/localhost-key.pem`).
- Pick the next free HTTP port = (max existing HTTP port) + 1. The TLS port is
  then automatically that + 1000 — don't hand-pick it.
- **HTTP transport vs stdio:**
  - `"type": "http"` apps need a running server process — they belong in
    `start-all.ps1` and are started by you.
  - `"type": "stdio"` apps are spawned on demand by the host from `mcp.json`
    (`command` + `args`) — do **not** add them to `start-all.ps1`.
- Run everything: `.\start-all.ps1` (TLS on → 4xxx). Flags: `-Force` to
  kill + restart, `-NoTls` for plain HTTP on 3xxx.

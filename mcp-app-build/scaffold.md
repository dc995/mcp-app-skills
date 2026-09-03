# Scaffold — New MCP App Project

## Dependencies

```bash
# Production
npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/server @modelcontextprotocol/core @modelcontextprotocol/node @modelcontextprotocol/sdk zod express

# Dev
npm install -D typescript vite vite-plugin-singlefile concurrently cross-env tsx @types/node @types/express
```

Always use `npm install` — never guess version numbers.

Check the installed ext-apps peer range before removing
`@modelcontextprotocol/sdk`. The command includes it for the currently published
v1-compatible extension helper. Remove it only after ext-apps supports SDK v2
and the legacy adapter is retired. Never pass a v1 `McpServer` object to a v2
handler. See [mcp-v2.md](mcp-v2.md).

## Legacy ext-apps server template

This template uses the currently published ext-apps helper with SDK v1. Keep it
inside the legacy compatibility adapter until ext-apps publishes a compatible
SDK v2 server API.

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

export function createLegacyAppServer(): McpServer {
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

## Modern `2026-07-28` transport entry points

Build the modern server with SDK v2 objects only. When ext-apps supports SDK v2,
add its app tool/resource registrations to this factory; until then, preserve a
text fallback and route the UI extension through the isolated compatibility
profile.

```typescript
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod";

function createModernServer(): McpServer {
  const server = new McpServer({
    name: "<App Name> Server",
    version: "1.0.0",
  });
  server.registerTool(
    "<tool-name>",
    {
      title: "<Tool Title>",
      description: "<What the tool does>",
      inputSchema: z.object({}),
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(args) }],
    }),
  );
  return server;
}

const modern = createMcpHandler(() => createModernServer(), {
  legacy: "reject",
});
const nodeHandler = toNodeHandler(modern);

// Mount nodeHandler on POST /mcp after Origin/auth/body-limit middleware.
// For stdio:
const stdio = serveStdio(() => createModernServer(), { legacy: "reject" });
```

Use `isLegacyRequest` only at a deliberate dual-era boundary. Never route a
malformed or failed modern request into the legacy handler. Do not add a session
map to the modern path.

## Legacy SDK v1 main.ts compatibility template

```typescript
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NextFunction, Request, Response } from "express";
import { createLegacyAppServer } from "./server.js";

const port = parseInt(process.env.PORT ?? "<YOUR_PORT>", 10);

async function startHTTP() {
  const app = createMcpExpressApp({
    host: "127.0.0.1",
    allowedHosts: ["localhost", "127.0.0.1"],
  });
  const allowedOrigins = new Set(
    (process.env.MCP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      res.status(403).json({ error: "Forbidden origin" });
      return;
    }
    next();
  });

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = createLegacyAppServer();
    // Legacy stateless v1 transport: a fresh server+transport per request.
    // Correct for display-only compatibility. This BREAKS legacy server-initiated
    // requests (sampling/createMessage, elicitation, resource subscriptions):
    // the client's reply arrives on a separate POST that lands on a new
    // transport instance, so the original request never resolves and the tool
    // times out (-32001). If your app calls back into the client, use the
    // compatibility requests; use the bounded stateful template below instead.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close().catch((error) =>
        console.error("Failed to close MCP transport", error),
      );
      void server.close().catch((error) =>
        console.error("Failed to close MCP server", error),
      );
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(port, "127.0.0.1", () =>
    console.log(`MCP server on http://127.0.0.1:${port}/mcp`),
  );
}

async function startStdio() {
  await createLegacyAppServer().connect(new StdioServerTransport());
}

if (process.argv.includes("--stdio")) startStdio();
else startHTTP();
```

## Legacy SDK v1 stateful template

Use this **only** when a declared legacy counterpart requires callbacks such as
sampling, elicitation, or old resource subscriptions. It keeps a
transport per session keyed by `Mcp-Session-Id` so the client's reply routes
back to the same instance. Do not use it for modern MRTR or application state.
See [sampling.md](sampling.md).

```typescript
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
// ...same imports as the stateless template...

type Session = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  lastSeenAt: number;
};

const sessions = new Map<string, Session>();
const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 30 * 60 * 1000;

async function closeSession(id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  const results = await Promise.allSettled([
    session.transport.close(),
    session.server.close(),
  ]);
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(failures, `Failed to fully close MCP session ${id}`);
  }
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.lastSeenAt < cutoff) {
      void closeSession(id).catch((error) =>
        console.error(`Failed to expire MCP session ${id}`, error),
      );
    }
  }
}, 60_000).unref();

app.all("/mcp", async (req: Request, res: Response) => {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  const existing = sid ? sessions.get(sid) : undefined;

  if (req.method === "DELETE") {
    if (!sid || !existing) {
      res.status(404).json({ error: "Unknown or expired session" });
      return;
    }
    await closeSession(sid);
    res.status(204).end();
    return;
  }

  let transport = existing?.transport;
  if (existing) existing.lastSeenAt = Date.now();

  if (!transport) {
    if (req.method !== "POST" || !isInitializeRequest(req.body)) {
      res.status(400).json({ jsonrpc: "2.0", id: null,
        error: { code: -32000, message: "Bad Request: no valid session ID" } });
      return;
    }
    if (sessions.size >= MAX_SESSIONS) {
      res.status(503).json({ error: "Session capacity reached" });
      return;
    }
    const server = createLegacyAppServer();
    const sessionTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) =>
        sessions.set(id, {
          server,
          transport: sessionTransport,
          lastSeenAt: Date.now(),
        }),
    });
    sessionTransport.onclose = () => {
      const id = sessionTransport.sessionId;
      if (!id) return;
      const session = sessions.get(id);
      sessions.delete(id);
      if (session) {
        void session.server.close().catch((error) =>
          console.error(`Failed to close MCP session server ${id}`, error),
        );
      }
    };
    transport = sessionTransport;
    await server.connect(sessionTransport);
  }
  await transport.handleRequest(req, res, req.body);
});
```

> Stateful servers hold per-session memory. Enforce authorization binding, TTL,
> capacity, `DELETE`, and cleanup. Horizontal deployments also need session
> affinity or a shared session/event store.

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

## Host registration

For VS Code, add a workspace or user MCP configuration entry. HTTP is acceptable
for loopback development unless your environment specifically requires HTTPS:

```json
"<app-id>": {
  "type": "http",
  "url": "http://127.0.0.1:<PORT>/mcp"
}
```

For a stdio server, register `command`, `args` and an absolute or reliably
resolved `cwd` instead of starting a persistent HTTP process.

TLS, reverse proxies, service launchers and port allocation are environment
decisions. If HTTPS is required, trust a development CA or use a scoped client
CA configuration; do not disable TLS verification process-wide.

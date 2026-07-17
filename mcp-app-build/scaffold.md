# Scaffold — New MCP App Project

## Dependencies

```bash
# Production
npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/sdk zod express

# Dev
npm install -D typescript vite vite-plugin-singlefile concurrently cross-env tsx @types/node @types/express
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
import type { NextFunction, Request, Response } from "express";
import { createServer } from "./server.js";

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
    const server = createServer();
    // STATELESS transport: a fresh server+transport per request. Correct for
    // "Display Frame" apps (tool in → UI out). ⚠️ This BREAKS server-initiated
    // requests (sampling/createMessage, elicitation, resource subscriptions):
    // the client's reply arrives on a separate POST that lands on a new
    // transport instance, so the original request never resolves and the tool
    // times out (-32001). If your app calls back into the client, use the
    // STATEFUL template below instead. See sampling.md (Frame Type B).
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
    const server = createServer();
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

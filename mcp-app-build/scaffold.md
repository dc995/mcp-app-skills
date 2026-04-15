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

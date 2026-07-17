# Server API Testing — Layer 1

No browser needed. Tests MCP protocol compliance, tool schemas, and resource serving via HTTP.

## MCP Initialize Request Pattern

Every MCP server health check starts with the initialize handshake:

```typescript
async function readJsonRpc(resp: Response): Promise<unknown> {
  const body = await resp.text();
  if (resp.headers.get("content-type")?.includes("text/event-stream")) {
    const data = body
      .split(/\r?\n/)
      .find((line) => line.startsWith("data:"));
    if (!data) throw new Error("SSE response contained no JSON-RPC data event");
    return JSON.parse(data.slice("data:".length).trim());
  }
  return JSON.parse(body);
}

async function mcpInitialize(port: number): Promise<unknown> {
  const resp = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    }),
  });
  return readJsonRpc(resp);
}
```

### What to Verify
- Response has `protocolVersion`, `serverInfo.name`, `capabilities`
- `capabilities.tools` is present (server has tools)
- Server reports expected tool count

## Tool Call Pattern

```typescript
async function callTool(port: number, name: string, args: Record<string, unknown>) {
  const resp = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return readJsonRpc(resp);
}
```

### What to Verify
- Response has `result.content` array
- Content has `type: "text"` with parseable data
- Tool-specific assertions (timestamps, coordinates, HTML content)

## Resource Read Pattern

```typescript
async function readResource(port: number, uri: string) {
  const resp = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/read",
      params: { uri },
    }),
  });
  return readJsonRpc(resp);
}
```

### What to Verify
- Response has `result.contents[0].text` containing HTML
- HTML contains `<script` tag (bundled JS present)
- MIME type is `text/html;profile=mcp-app`

For a stateful server, capture the `MCP-Session-Id` response header from
`initialize` and send it on every subsequent request. Prefer the official SDK
client for full lifecycle/session tests; raw JSON-RPC is useful only for focused
wire-level assertions.

## Server Registry Pattern

Define a central registry for all servers under test:

```typescript
export const SERVERS: Record<string, { port: number; tools: string[] }> = {
  "example": {
    port: Number(process.env.EXAMPLE_MCP_PORT ?? 3000),
    tools: ["example-tool"],
  },
};
```

Iterate over this for health checks:

```typescript
for (const [id, info] of Object.entries(SERVERS)) {
  test(`${id} server responds to MCP initialize`, async () => {
    const result = await mcpInitialize(info.port);
    expect(result).toHaveProperty("result.serverInfo");
  });
}
```

## AppHub REST API Testing

If using AppHub as host, test its proxy endpoints:

```typescript
const CUSTOM_HOST = process.env.CUSTOM_HOST_URL;

test("custom host lists connected servers", async () => {
  test.skip(!CUSTOM_HOST, "CUSTOM_HOST_URL is not configured");
  const resp = await fetch(`${CUSTOM_HOST}/api/servers`);
  const data = await resp.json();
  expect(data.servers.length).toBeGreaterThan(0);
  expect(data.servers.every(s => s.status === "connected")).toBe(true);
});

test("custom host proxies tool calls", async () => {
  test.skip(!CUSTOM_HOST, "CUSTOM_HOST_URL is not configured");
  const resp = await fetch(`${CUSTOM_HOST}/api/tools/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId: "example", tool: "example-tool", args: {} }),
  });
  const data = await resp.json();
  expect(data.content).toBeDefined();
});
```

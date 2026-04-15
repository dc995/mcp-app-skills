# Server API Testing — Layer 1

No browser needed. Tests MCP protocol compliance, tool schemas, and resource serving via HTTP.

## MCP Initialize Request Pattern

Every MCP server health check starts with the initialize handshake:

```typescript
async function mcpInitialize(port: number): Promise<unknown> {
  const resp = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    }),
  });
  return resp.json();
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return resp.json();
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/read",
      params: { uri },
    }),
  });
  return resp.json();
}
```

### What to Verify
- Response has `result.contents[0].text` containing HTML
- HTML contains `<script` tag (bundled JS present)
- MIME type is `text/html; ext-apps`

## Server Registry Pattern

Define a central registry for all servers under test:

```typescript
export const SERVERS: Record<string, { port: number; tools: string[] }> = {
  "get-time": { port: 3006, tools: ["get-time"] },
  "threejs":  { port: 3002, tools: ["show_threejs_scene", "learn_threejs"] },
  "map":      { port: 3003, tools: ["show-map", "geocode", "fetch-boundary"] },
  "budget":   { port: 3004, tools: ["allocate-budget"] },
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
const APPHUB = "http://localhost:3009";

test("AppHub lists connected servers", async () => {
  const resp = await fetch(`${APPHUB}/api/servers`);
  const data = await resp.json();
  expect(data.servers.length).toBeGreaterThan(0);
  expect(data.servers.every(s => s.status === "connected")).toBe(true);
});

test("AppHub proxies tool calls", async () => {
  const resp = await fetch(`${APPHUB}/api/tools/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId: "get-time", tool: "get-time", args: {} }),
  });
  const data = await resp.json();
  expect(data.content).toBeDefined();
});
```

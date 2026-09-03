# Server API Testing — Layer 1

No browser needed. Tests MCP protocol compliance, tool schemas, and resource serving via HTTP.

## Modern MCP `2026-07-28` Request Pattern

Modern health checks do not initialize a protocol session. Send a
self-contained request with routing headers and request `_meta`:

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

function encodeMcpHeaderValue(value: string): string {
  const isPlainAscii =
    /^[\x20-\x7e]+$/.test(value) &&
    value.trim() === value &&
    !value.startsWith("=?base64?");
  return isPlainAscii
    ? value
    : `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

async function modernRequest(
  port: number,
  method: string,
  params: Record<string, unknown> = {},
): Promise<{ response: Response; body: unknown }> {
  const name =
    typeof params.name === "string"
      ? params.name
      : typeof params.uri === "string"
        ? params.uri
        : undefined;
  const resp = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      ...(name ? { "Mcp-Name": encodeMcpHeaderValue(name) } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientInfo": {
            name: "test-client",
            version: "1.0.0",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  return { response: resp, body: await readJsonRpc(resp) };
}
```

Prefer the official SDK v2 client for general integration tests. This raw helper
is for focused wire assertions and assumes the operation has no schema fields
mapped to additional `Mcp-Param-*` headers.

### What to Verify
- `server/discover` reports support for `2026-07-28`
- `tools/list` succeeds without `initialize` or `Mcp-Session-Id`
- Response has `resultType` and server metadata
- Server reports expected tool count
- `Mcp-Method`/body and `Mcp-Name`/tool disagreement fails
- Concurrent requests do not depend on shared transport state

## Tool Call Pattern

```typescript
async function callTool(port: number, name: string, args: Record<string, unknown>) {
  return modernRequest(port, "tools/call", { name, arguments: args });
}
```

### What to Verify
- Response has `result.content` array
- Content has `type: "text"` with parseable data
- Tool-specific assertions (timestamps, coordinates, HTML content)

## Resource Read Pattern

```typescript
async function readResource(port: number, uri: string) {
  return modernRequest(port, "resources/read", { uri });
}
```

### What to Verify
- Response has `result.contents[0].text` containing HTML
- HTML contains `<script` tag (bundled JS present)
- MIME type is `text/html;profile=mcp-app`

For a declared legacy/sessionful compatibility profile, keep separate tests that
capture `Mcp-Session-Id` from `initialize`. Do not use those fixtures as the
health check for the modern endpoint.

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
  test(`${id} server responds to modern tools/list`, async () => {
    const { response, body } = await modernRequest(info.port, "tools/list");
    expect(response.headers.has("Mcp-Session-Id")).toBe(false);
    expect(body).toHaveProperty("result.tools");
  });
}
```

## MRTR and application-state tests

- Retry `input_required` responses with `inputResponses` on a different server
  instance.
- Tamper with, replay, expire, and cross-Realm-test `requestState`.
- Test application handles separately: missing, expired, cross-subject and
  cross-Realm handles must fail closed.
- Verify private `ttlMs`/`cacheScope` results never cross cache partitions.

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

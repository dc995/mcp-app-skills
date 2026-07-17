# Playwright Patterns — Multi-App Validation

## Shared Helpers (helpers.ts)

```typescript
export const CUSTOM_HOST_HTTP =
  process.env.CUSTOM_HOST_URL ?? "http://127.0.0.1:3000";

export const SERVERS: Record<string, { port: number; tools: string[] }> = {
  "example": {
    port: Number(process.env.EXAMPLE_MCP_PORT ?? 3001),
    tools: ["example-tool"],
  },
};

export async function isServerReachable(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {},
                  clientInfo: { name: "test", version: "1.0.0" } },
      }),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch { return false; }
}

export async function apphubGet(path: string): Promise<unknown> {
  const resp = await fetch(`${CUSTOM_HOST_HTTP}${path}`);
  if (!resp.ok) throw new Error(`GET ${path}: ${resp.status}`);
  return resp.json();
}

export async function apphubPost(path: string, body: unknown): Promise<unknown> {
  const resp = await fetch(`${CUSTOM_HOST_HTTP}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`POST ${path}: ${resp.status}`);
  return resp.json();
}
```

## Playwright Config

```typescript
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["html", { open: "on-failure" }], ["list"]],
  use: {
    baseURL: process.env.CUSTOM_HOST_URL || "http://127.0.0.1:3000",
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "server-api", testDir: "./server" },
    { name: "smoke", testDir: "./e2e", grep: /@smoke/ },
    { name: "e2e", testDir: "./e2e" },
  ],
});
```

## Test File Structure

```
tests/
├── helpers.ts              # Shared: fetch wrappers, server registry
├── fixtures.ts             # Playwright custom fixtures (AppHubPage, TilePage)
├── playwright.config.ts
├── server/                 # Layer 1: no browser
│   ├── health.spec.ts
│   ├── get-time.spec.ts
│   ├── map.spec.ts
│   └── budget.spec.ts
└── e2e/                    # Layer 2: browser
    ├── apphub-load.spec.ts
    ├── splash-launch.spec.ts
    ├── individual-tiles.spec.ts
    └── chain-execution.spec.ts
```

## Key Conventions

- Tags: `@smoke`, `@critical`, `@slow`
- Page objects: one per logical UI surface (AppHubPage, TilePage)
- Fixtures provide setup/teardown lifecycle
- Console capture fixture catches CSP errors and unexpected warnings
- Server API tests have NO browser dependency — pure HTTP
- E2E fixtures should start or verify only the processes they require

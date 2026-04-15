# Playwright Patterns — Extracted from mcpapps1 Test Suite

## Shared Helpers (helpers.ts)

```typescript
export const APPHUB_HTTP = "http://localhost:3009";

export const SERVERS: Record<string, { port: number; tools: string[] }> = {
  "get-time": { port: 3006, tools: ["get-time"] },
  "threejs":  { port: 3002, tools: ["show_threejs_scene", "learn_threejs"] },
  "map":      { port: 3003, tools: ["show-map", "geocode", "fetch-boundary"] },
  "budget":   { port: 3004, tools: ["allocate-budget"] },
  "system-monitor": { port: 3005, tools: ["system-monitor", "get-metrics"] },
  "transcript":     { port: 3008, tools: ["transcribe"] },
};

export async function isServerReachable(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {},
                  clientInfo: { name: "test", version: "1.0.0" } },
      }),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch { return false; }
}

export async function apphubGet(path: string): Promise<unknown> {
  const resp = await fetch(`${APPHUB_HTTP}${path}`);
  if (!resp.ok) throw new Error(`GET ${path}: ${resp.status}`);
  return resp.json();
}

export async function apphubPost(path: string, body: unknown): Promise<unknown> {
  const resp = await fetch(`${APPHUB_HTTP}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    baseURL: process.env.APPHUB_URL || "http://localhost:3009",
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
- E2E tests assume `start-all.ps1` has been run

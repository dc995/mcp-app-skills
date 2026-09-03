# Cross-Host Testing — Layer 3

Run the same MCP App against multiple hosts and compare behavior. Uses `host-matrix.json` from `mcp-app-hosts` to drive expectations.

## Concept

Same server, multiple host endpoints. Each host has a profile of what should work and what should fail. Tests annotate expected failures per host.

## Config Pattern

```typescript
// cross-host.config.ts
interface HostProfile {
  name: string;
  baseURL: string;
  expectEvalWorks: boolean;
  expectExternalFetchWorks: boolean;
  expectMicrophoneWorks: boolean;
  expectCdnScriptsWork: boolean;
  // Frame Type B — server-initiated requests. See mcp-app-build/sampling.md
  // and the `server-initiated` block in host-matrix.json.
  expectSamplingWorks: boolean;
  expectElicitationWorks: boolean;
}

const HOSTS: HostProfile[] = [
  {
    name: "apphub",
    baseURL: process.env.CUSTOM_HOST_URL ?? "http://127.0.0.1:3000",
    expectEvalWorks: true,
    expectExternalFetchWorks: true,
    expectMicrophoneWorks: true,
    expectCdnScriptsWork: true,
    expectSamplingWorks: true,      // fulfilled via the host's agent SDK bridge
    expectElicitationWorks: false,  // not yet implemented in apphub
  },
  {
    name: "standalone",
    baseURL: "http://localhost:8080",
    expectEvalWorks: true,
    expectExternalFetchWorks: true,
    expectMicrophoneWorks: true,
    expectCdnScriptsWork: true,
    expectSamplingWorks: false,     // unvalidated — treat as Type A only until probed
    expectElicitationWorks: false,
  },
  // VS Code cannot be tested via Playwright directly —
  // use manual testing or VS Code Extension Host tests
];
```

## Expected-Failure Pattern

Use `test.fail()` for features expected to break in a specific host. This way, if the host later ADDS support, the test starts passing and **flags a HIT [SUPPORT] discovery**.

```typescript
for (const host of HOSTS) {
  test.describe(`${host.name} host`, () => {

    test("data-driven chart renders", async ({ page }) => {
      // Expected across the currently configured/validated hosts
      await page.goto(host.baseURL);
      // ... render chart via tool call
      await expect(page.locator("canvas")).toBeVisible();
    });

    test("eval-based rendering works", async ({ page }) => {
      if (!host.expectEvalWorks) {
        test.fail(); // Expected to fail in VS Code
      }
      // ... test dynamic code execution
    });

    test("external CDN script loads", async ({ page }) => {
      if (!host.expectCdnScriptsWork) {
        test.fail(); // Expected to fail in VS Code
      }
      // ... test external script tag
    });
  });
}
```

## Why test.fail() Instead of test.skip()

- `test.skip()` → never runs, won't notice when host adds support
- `test.fail()` → runs, expects failure. If it PASSES, Playwright flags it → trigger HIT [SUPPORT] discovery

## Interactive requests — modern and legacy

For MCP `2026-07-28`, test `input_required`/`inputResponses`, explicit
application handles, and `subscriptions/listen` without expecting a core
protocol session. A retry must be able to land on a different server instance.

Display-Frame (Type A) apps are fully covered by the patterns above. **Type B**
legacy adapters may additionally call *back* into the client over an unsolicited
reverse channel (`sampling/createMessage`, `elicitation/create`, resource
subscriptions). These need a **stateful** server transport, a host that
advertises the capability, and any host-specific authorization — so they have
their own cross-host expectations. A modern MRTR operation may instead embed a
deprecated Sampling request without these legacy transport mechanics. See
[`../mcp-app-build/sampling.md`](../mcp-app-build/sampling.md).

Because these are server→client requests, the meaningful assertion is at the
**tool-result** layer (Layer 1), not the rendered DOM: a Type B tool must return
its *real* result where the host supports the capability, and its *graceful
fallback* where it does not.

```typescript
for (const host of HOSTS) {
  test.describe(`${host.name} — server-initiated`, () => {

    test("sampling tool returns a real result", async () => {
      if (!host.expectSamplingWorks) {
        test.fail(); // host has no sampling → expect the fallback branch instead
      }
      const res = await callTool(host.baseURL, "get_hint", { game_id });
      const text = textOf(res);
      expect(text).toMatch(/Hint:/);          // model actually answered
      expect(text).not.toMatch(/host declined/); // not the degraded path
    });

    test("sampling tool degrades gracefully where unsupported", async () => {
      if (host.expectSamplingWorks) return;   // only asserts on Type A-only hosts
      const res = await callTool(host.baseURL, "get_hint", { game_id });
      // Must NOT hang or -32001; must return a usable fallback.
      expect(textOf(res)).toMatch(/host declined|no hint available/i);
    });

    test("sampling cancellation preserves state", async () => {
      const before = await readAppState();
      const res = await callSamplingToolWithCancelledHost();
      expect(statusOf(res)).toMatch(/declined|cancelled/i);
      expect(statusOf(res)).not.toMatch(/applied|success/i);
      expect(await readAppState()).toEqual(before);
    });
  });
}
```

**Probe the selected profile first.** A stateless v1 server cannot satisfy the
legacy reverse-request pattern: it times out with `-32001`. Confirm that a
legacy test negotiated `initialize` and `Mcp-Session-Id`. Modern tests must
instead prove there is no session header and exercise the MRTR retry.

**Probe authorization separately.** In VS Code, an MCP App button is outside-chat
sampling and requires `allowedOutsideChat: true` for the exact configured server
entry under `chat.mcp.serverSampling`. A host can advertise `sampling` and still
return `stopReason: "cancelled"` when this grant is missing. Reload/reconnect
after changing the setting before judging the fix.

## Testing a Local Server in a Remote Host (`cloudflared`)

Remote hosts (Claude.ai, hosted assistants) **cannot reach `localhost`**. To exercise a
local HTTP MCP server in a remote host, expose it through a tunnel:

```bash
# 1. Start your MCP server locally (e.g. http://localhost:3001/mcp)
# 2. Open a public tunnel
cloudflared tunnel --url http://127.0.0.1:3001
# 3. Copy the generated https://<random>.trycloudflare.com URL
# 4. Register it in the host as a remote server, appending your MCP path:
#    https://<random>.trycloudflare.com/mcp
```

- The tunnel URL **changes on every restart** — re-register after each `cloudflared` start.
- Install `cloudflared` from the official Cloudflare distribution and pin/verify
  it according to your environment policy.
- A public tunnel exposes the server to the internet. Require authentication,
  Origin validation, tool authorization and rate limits before using it.
- VS Code reaches `localhost` directly, so it needs no tunnel; this is only for remote hosts.
- Treat a pass in one remote host as necessary-but-not-sufficient; validate every
  declared target independently.
- Source: [ext-apps testing guide](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/testing-mcp-apps.md).

## VS Code Testing Approach

VS Code MCP Apps cannot be tested via standard Playwright (Electron + webview origin issues). Options:

1. **Manual DevTools inspection**: Help → Toggle Developer Tools → Console. Check for CSP errors.
2. **Server API tests**: Layer 1 tests work regardless of host (just HTTP).
3. **VS Code Extension Host tests**: Use `@vscode/test-electron` for programmatic testing (heavy setup).
4. **Compare approach**: If it works in AppHub but not in VS Code, the delta is almost always CSP/sandbox. Check `mcp-app-hosts/vscode.md`.

## Regression Detection

When the host matrix changes (new host support, new restrictions):
1. Update `host-matrix.json`
2. Update `cross-host.config.ts` expectations
3. Run cross-host tests
4. Any test that flips from fail→pass or pass→fail is a signal
5. Record via HIT process

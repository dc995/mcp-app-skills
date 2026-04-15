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
}

const HOSTS: HostProfile[] = [
  {
    name: "apphub",
    baseURL: "https://localhost:4009",
    expectEvalWorks: true,
    expectExternalFetchWorks: true,
    expectMicrophoneWorks: true,
    expectCdnScriptsWork: true,
  },
  {
    name: "standalone",
    baseURL: "http://localhost:8080",
    expectEvalWorks: true,
    expectExternalFetchWorks: true,
    expectMicrophoneWorks: true,
    expectCdnScriptsWork: true,
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
      // Should work in ALL hosts
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

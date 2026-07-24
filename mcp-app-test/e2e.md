# E2E Testing — Layer 2

Playwright browser tests for MCP App UIs. Validates rendering, iframe bridge protocol, and user interactions.

## Architecture

```
Fixtures  → resource lifecycle (setup, provide, teardown)
Pages     → UI interaction (navigation, actions, locators)
Helpers   → stateless utilities (data generation, API calls)
```

## Page Object: AppHub

```typescript
export class AppHubPage {
  readonly promptInput: Locator;
  readonly sendButton: Locator;
  readonly splashAllButton: Locator;
  readonly serverCount: Locator;
  readonly tileGrid: Locator;
  readonly activityLog: Locator;

  constructor(readonly page: Page) {
    this.promptInput = page.locator("#prompt");
    this.sendButton = page.locator("#btn-send");
    this.splashAllButton = page.locator("#btn-splash-all");
    this.serverCount = page.locator("#srv-count");
    this.tileGrid = page.locator("#grid");
    this.activityLog = page.locator("#log");
  }

  async goto() {
    await this.page.goto("/", { waitUntil: "networkidle" });
  }

  async launchAllSplashes() {
    await this.splashAllButton.click();
  }

  async waitForSplashesLoaded(timeoutMs = 12_000) {
    await this.page.locator(".tile iframe").first()
      .waitFor({ state: "visible", timeout: timeoutMs });
  }
}
```

## Page Object: Individual Tile

```typescript
export class TilePage {
  readonly container: Locator;
  readonly iframe: FrameLocator;
  readonly demoButton: Locator;
  readonly expandButton: Locator;

  constructor(readonly page: Page, readonly serverId: string) {
    this.container = page.locator(`[data-server="${serverId}"]`);
    this.iframe = this.container.frameLocator("iframe");
    this.demoButton = this.container.locator(".btn-demo");
    this.expandButton = this.container.locator(".btn-expand");
  }

  async launchDemo() {
    await this.demoButton.click();
  }

  async waitForIframe(timeoutMs = 10_000) {
    await this.container.locator("iframe")
      .waitFor({ state: "visible", timeout: timeoutMs });
  }
}
```

## Fixture Pattern

```typescript
import { test as base } from "@playwright/test";

export const test = base.extend<{
  appHub: AppHubPage;
  console: { errors: string[]; warnings: string[] };
}>({
  appHub: async ({ page }, use) => {
    const hub = new AppHubPage(page);
    await hub.goto();
    await use(hub);
  },
  console: async ({ page }, use) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    await use({ errors, warnings });
  },
});
```

## Key Test Patterns

### Verify iframe bridge initialization
```typescript
test("tile iframe initializes via MCP bridge", async ({ appHub }) => {
  const tile = appHub.tile("get-time");
  await tile.launchDemo();
  await tile.waitForIframe();
  // The iframe should have content rendered (not blank)
  const iframeContent = tile.iframe.locator("body");
  await expect(iframeContent).not.toBeEmpty();
});
```

### Detect CSP violations
```typescript
test("no CSP errors on load", async ({ appHub, console }) => {
  await appHub.launchAllSplashes();
  await appHub.waitForSplashesLoaded();
  await appHub.page.waitForTimeout(2000);
  const cspErrors = console.errors.filter(e =>
    e.includes("Content Security Policy") || e.includes("CSP")
  );
  expect(cspErrors).toHaveLength(0);
});
```

### Test postMessage communication
```typescript
test("UI receives tool result via postMessage", async ({ appHub }) => {
  const tile = appHub.tile("budget");
  await tile.launchDemo();
  await tile.waitForIframe();
  // Budget app should render category sliders from splash data
  const sliders = tile.iframe.locator("input[type=range]");
  await expect(sliders.first()).toBeVisible({ timeout: 5000 });
});
```

### Test initial hydration and resource-only fallback

Cover both supported launch paths when an app implements them:

```typescript
test("show tool hydrates a usable configured state", async ({ appHub }) => {
  const tile = appHub.tile("image-studio");
  await tile.launchDemo();
  await expect(tile.iframe.locator("[data-session-id]")).not.toHaveText("pending");
  await expect(tile.iframe.locator("select[name=provider]")).not.toHaveValue("");
});

test("resource-only mount self-hydrates once", async ({ appHub }) => {
  const tile = appHub.tile("image-studio");
  await tile.launchResourceOnly();
  await expect(tile.iframe.locator("[data-session-id]")).not.toHaveText("pending");
  await expect(tile.serverCalls("show_app")).resolves.toHaveLength(1);
});
```

The second test applies only when resource-only/splash rendering is an explicit
requirement. It should prove the fallback is idempotent and does not race the
host-delivered initial result into two sessions.

### Test display-mode negotiation

For apps that need a large working surface, assert that they advertise fullscreen,
request it only when the mocked host offers it, and remain usable when the host
returns inline mode. A CSS height assertion alone is insufficient because the host
owns the iframe container.

## Playwright Config Structure

```typescript
export default defineConfig({
  projects: [
    { name: "server-api", testDir: "./server" },
    { name: "smoke", testDir: "./e2e", grep: /@smoke/ },
    { name: "e2e", testDir: "./e2e" },
  ],
});
```

## Tags

- `@smoke` — fast subset for PR gates
- `@critical` — must-pass tests
- `@slow` — heavy tests (chain execution, multi-splash)

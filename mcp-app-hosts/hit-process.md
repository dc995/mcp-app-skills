# HIT — Host Incompatibility Tracker

Process for recording new discoveries about MCP App host capabilities. Follow this whenever a build or test reveals something new — whether a limitation or newly-gained support.

## When to Trigger HIT

- Build or test fails due to host constraint (CSP, permission, network)
- Manual testing reveals behavior different from what's recorded
- A host update adds support for previously-blocked features
- Library/SDK observed to break or work in a specific host

## 4-Step Process

### 1. DISCOVER

Observe the failure or new behavior:
- CSP console error in DevTools
- Permission denied / NotAllowedError
- Network request blocked
- Library throws at runtime
- Feature that was broken now works (positive discovery!)

Document the **exact error message** and the **host + app** where it occurred.

### 2. CLASSIFY

Assign a category:

| Tag | Description | Example |
|---|---|---|
| `[CSP]` | eval/Function/inline script blocked | `new Function()` in VS Code |
| `[CDN]` | External script/style tag blocked | Azure Maps SDK `<script src>` |
| `[PERMISSION]` | iframe sandbox blocks browser API | `getUserMedia` denied |
| `[NETWORK]` | fetch to external domain blocked | `connect-src` restriction |
| `[SECURE-CTX]` | API requires HTTPS / secure context | Translation API, Web Bluetooth |
| `[PROTOCOL]` | postMessage handshake or timing issue | tool-input before initialized |
| `[RENDERING]` | Library uses blocked pattern internally | Knockout.js inside CesiumJS |
| `[TRANSPORT]` | HTTP vs SSE vs Streamable HTTP difference | Session handling varies |
| `[SUPPORT]` | Host NOW supports previously-blocked feature | Positive — upgrade the matrix! |

### 3. RECORD

Update **three targets**:

#### a. `host-matrix.json`
Update the relevant host's capability field. Set `last-validated` to today's date.

```json
// Example: discovered VS Code now supports clipboard-write
"vscode": {
  "sandbox": {
    "clipboard-write": true   // was "varies", now confirmed true
  },
  "last-validated": "2026-04-10"
}
```

#### b. `LESSONS_LEARNED.md` (workspace)
Add a new issue entry if the discovery is novel:

```markdown
## Issue #N: <Title>

**Date discovered**: YYYY-MM-DD
**App affected**: <AppName>
**Host**: <HostId>
**Category**: [TAG]
**Severity**: Breaking | Degraded | Cosmetic

### Problem
<What happened>

### Error Message
<Exact error>

### Solution / Workaround
<What fixed it or why it can't be fixed>
```

#### c. Repository memory (`/memories/repo/`)
Add a quick-reference entry for future sessions:

```
## HIT: <brief title>
- Host: <id>, Category: [TAG]
- <one-line summary>
- Workaround: <brief>
```

### 4. PROPAGATE

The system auto-benefits:
- `mcp-app-build` pre-build check reads `host-matrix.json` → warns before building
- `mcp-app-test` cross-host tests read matrix → expected-failure annotations
- `mcp-app-audit` reads matrix → compatibility reports
- `SKILL.md` capability table should be regenerated from `host-matrix.json` if it drifts

## Example HIT Record

```
DISCOVER: AzureMapsMCPapp fails in VS Code — blank map, CSP errors in console
CLASSIFY: [CDN] + [NETWORK]
  - <script src="https://atlas.microsoft.com/sdk/..."> blocked by script-src
  - Runtime tile fetch to atlas.microsoft.com blocked by connect-src
RECORD:
  a. host-matrix.json → vscode.features.cdn-script-tags = false (already set)
  b. LESSONS_LEARNED.md → Issue #9 (new entry)
  c. /memories/repo/ → quick note
PROPAGATE:
  - Pre-build check will warn: "Your app loads external scripts — blocked in VS Code"
  - SDK compat table updated: azure-maps-control → broken
```

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
| `[CDN]` | External script/style tag blocked | Vendor SDK `<script src>` from a CDN in VS Code |
| `[PERMISSION]` | iframe sandbox blocks browser API | `getUserMedia` denied |
| `[NETWORK]` | fetch to external domain blocked | `connect-src` restriction |
| `[SECURE-CTX]` | API requires HTTPS / secure context | Translation API, Web Bluetooth |
| `[PROTOCOL]` | postMessage handshake or timing issue | tool-input before initialized |
| `[RENDERING]` | Library uses blocked pattern internally | Knockout.js inside CesiumJS |
| `[TRANSPORT]` | HTTP vs SSE vs Streamable HTTP difference | Session handling varies |
| `[SECURITY]` | Trust-boundary or authorization weakness | Same-origin untrusted iframe, SSRF |
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

#### b. `evidence/<host>-<date>.md`
Add or update a public evidence note:

```markdown
# <Host> validation — <date>

- Evidence type: upstream | empirical
- Host/runtime/SDK versions: <versions>
- Capability: <matrix field>
- Minimal reproduction: <steps>
- Observed result: <result/error>
- Scope/limitations: <what this does not prove>
```

Do not include private source code, secrets, personal data or absolute local
paths. Distill the portable behavior and reproduction.

#### c. Host documentation

Update the relevant host file when the evidence changes user-facing guidance.
Avoid duplicating capability tables manually; the matrix remains authoritative.

### 4. PROPAGATE

Run the executable gates:

- `validate_host_matrix` verifies schema, evidence and feature completeness.
- `check_multi_host_compatibility` computes the target-host intersection.
- `npm run smoke` prevents matrix/tool drift.
- `node scripts/validate-repo.mjs` checks links, packaging and stale protocol literals.

Static Markdown checklists are guidance; they do not automatically consume the
matrix unless invoked through the companion MCP server.

## Example HIT Record

```
DISCOVER: MapMCPapp fails in VS Code — blank map, CSP errors in console
CLASSIFY: [CDN] + [NETWORK]
  - <script src="https://cdn.vendor.example/sdk/..."> blocked by script-src
  - Runtime tile fetch to the vendor's domain blocked by connect-src
RECORD:
  a. host-matrix.json → vscode.features.cdn-script-tags = false (already set)
  b. evidence/vscode-YYYY-MM.md → dated reproduction
  c. vscode.md → portable workaround
PROPAGATE:
  - validate_host_matrix passes
  - check_multi_host_compatibility reports the expected blocker
```

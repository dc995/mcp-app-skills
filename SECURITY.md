# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting/security-advisory mechanism for
issues that could expose host credentials, execute code across an iframe trust
boundary, bypass tool authorization, enable SSRF, leak secrets or compromise MCP
sessions.

Do not include secrets, tokens, private source code or personal information in a
public issue.

Compatibility errors and documentation corrections that do not disclose an
exploitable weakness may be reported through normal GitHub issues.

## Scope

Security reports may cover:

- The companion `mcp-app-ext` MCP server
- Generated scaffold and host patterns
- iframe/CSP/postMessage guidance
- Transport/session/OAuth/egress guidance
- Host matrix claims that would cause an unsafe deployment

The empirical example hosts described in `evidence/` are validation harnesses,
not production security guarantees.

## Dependency audit exception

The companion server is stdio-only and does not expose Hono's `serve-static`.
Until `@modelcontextprotocol/sdk` permits `@hono/node-server >=2.0.5`, the
production audit allows only
[GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9)
in that unreachable path. `scripts/audit-production.mjs` fails on every other
production advisory. Reassess this exception when the SDK dependency changes or
before adding an HTTP/static-file surface.

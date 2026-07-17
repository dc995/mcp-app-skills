# GitHub Copilot SDK host validation — June 2026

**Evidence type:** empirical

Differential testing between a working Copilot SDK host and a second host
identified these portable behaviors:

- Remote HTTP/SSE MCP server configurations required an explicit `tools: ["*"]`
  fallback in the tested Copilot CLI/SDK versions.
- Tool calls had to be captured through session hooks rather than inferred from
  the final reply payload.
- Interleaved built-in tool hooks required result correlation by tool identity.
- Failed calls had to be resolved explicitly so later results were not attached
  to stale pending calls.
- Sampling required both capability advertisement and a request handler on the
  client connection carrying the tool call.

These are dated empirical observations. Current public SDK documentation should
be treated as normative where it has since documented the behavior.

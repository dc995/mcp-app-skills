# Validation Evidence

This directory records the provenance behind empirical host capability claims.
It deliberately contains distilled, reproducible observations rather than
private product architecture or machine-specific paths.

## Evidence classes

- **Upstream**: supported by an authoritative specification, SDK source or host
  documentation.
- **Empirical**: reproduced in a named harness with recorded versions and date.

Empirical evidence is not a platform guarantee. Revalidate it when the host,
browser, MCP SDK or MCP Apps SDK changes.

## Required fields

Each evidence note should include:

- Date and environment/version identifiers
- Capability or failure tested
- Minimal reproduction
- Observed result/error
- Scope and limitations
- Related `host-matrix.json` fields

The source applications that originally produced these lessons were mcpapps1 and
DeepSpaceMind. Public guidance keeps only the portable technique and evidence.
